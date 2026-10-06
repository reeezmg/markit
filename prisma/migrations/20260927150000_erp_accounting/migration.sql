CREATE TABLE accountant_v2_erp_settings (
 company_id text PRIMARY KEY REFERENCES companies(id),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 accounts jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE accountant_v2_erp_sources (
 company_id text NOT NULL REFERENCES companies(id), source_key text NOT NULL,
 signature jsonb NOT NULL DEFAULT '{}', accounts jsonb NOT NULL DEFAULT '{}',
 revision integer NOT NULL DEFAULT 0, journal_id text,
 PRIMARY KEY(company_id,source_key)
);

-- Signed amounts are debit-positive. No writes to legacy stock or money ledgers.
CREATE FUNCTION accountant_v2_sync_erp(c text, kind text, sid text, force_import boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE cfg accountant_v2_erp_settings; prev accountant_v2_erp_sources;
 doc jsonb; selected jsonb; sig jsonb; lines jsonb:='[]'; costs jsonb:='{}';
 e record; l jsonb; split jsonb; gross numeric; tax numeric; base numeric; cost numeric:=0;
 amount numeric; total numeric; entry_tax numeric; role text; account text; expected_type text;
 d timestamp; reference text; key text:=lower(kind)||':'||sid;
 jid text; rid text; oldj accountant_v2_manual_journals; rev integer; active boolean:=false;
BEGIN
 SELECT * INTO cfg FROM accountant_v2_erp_settings WHERE company_id=c AND enabled;
 IF NOT FOUND THEN RETURN 0; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('accountant-v2:'||c));
 SELECT * INTO prev FROM accountant_v2_erp_sources WHERE company_id=c AND source_key=key;
 IF prev.signature->>'excluded'='true' AND NOT force_import THEN RETURN 0; END IF;
 IF kind='BILL' THEN
   SELECT to_jsonb(b) INTO doc FROM bills b WHERE id=sid AND company_id=c;
 ELSIF kind='EXPENSE' THEN
   SELECT to_jsonb(x) INTO doc FROM expenses x WHERE id=sid AND company_id=c;
 ELSE RAISE EXCEPTION 'Unknown ERP source'; END IF;
 IF prev.source_key IS NULL AND NOT force_import AND (doc IS NULL OR (doc->>'created_at')::timestamp<cfg.activated_at) THEN RETURN 0; END IF;
 selected:=CASE WHEN prev.accounts<>'{}' THEN prev.accounts ELSE cfg.accounts END;
 costs:=COALESCE(prev.signature->'costs','{}'::jsonb);
 gross:=round(COALESCE((doc->>CASE WHEN kind='BILL' THEN 'grand_total' ELSE 'total_amount' END)::numeric,0),2);
 d:=COALESCE((doc->>CASE WHEN kind='BILL' THEN 'created_at' ELSE 'expense_date' END)::timestamp,now());
 reference:=CASE WHEN kind='BILL' THEN 'INV-'||COALESCE(doc->>'invoice_number',sid) ELSE 'EXP-'||COALESCE(doc->>'expense_number',sid) END;
 IF kind='BILL' THEN
   active:=doc IS NOT NULL AND NOT COALESCE((doc->>'deleted')::boolean,false)
     AND NOT COALESCE((doc->>'is_markit')::boolean,false)
     AND COALESCE(doc->>'type','BILL')='BILL'
     AND doc->>'payment_status' IN ('PAID','PENDING');
   IF active THEN
     tax:=0; base:=0;
     FOR e IN SELECT x.*,v.p_price FROM entries x LEFT JOIN variants v ON v.id=x.variant_id WHERE x.bill_id=sid LOOP
       IF COALESCE(e.tax,0)<0 THEN RAISE EXCEPTION 'Invalid sales tax rate'; END IF;
       amount:=COALESCE(e.value,0)::numeric * CASE WHEN e.return THEN -1 ELSE 1 END;
       base:=base+amount;
       tax:=tax+amount*COALESCE(e.tax,0)::numeric/(100+COALESCE(e.tax,0)::numeric);
       -- Retain the original cost per entry when its source is edited later.
       entry_tax:=COALESCE((prev.signature->'costs'->>(e.id||':'||COALESCE(e.variant_id,'')))::numeric,e.p_price::numeric,0);
       costs:=costs||jsonb_build_object(e.id||':'||COALESCE(e.variant_id,''),entry_tax);
       cost:=cost+entry_tax*COALESCE(e.qty,0)::numeric*CASE WHEN e.return THEN -1 ELSE 1 END;
     END LOOP;
     -- Allocate invoice-wide discount/rounding across the tax-inclusive row total.
     tax:=CASE WHEN base<>0 THEN round(tax*gross/base,2) ELSE round(tax,2) END;
     cost:=round(cost,2);
     IF doc->>'payment_method'='Split' THEN
       total:=0;
       IF jsonb_typeof(doc->'split_payments')<>'array' THEN RAISE EXCEPTION 'Split payments must be an array'; END IF;
       FOR split IN SELECT value FROM jsonb_array_elements(doc->'split_payments') LOOP
         amount:=round(COALESCE((split->>'amount')::numeric,0),2); total:=total+amount;
         role:=CASE lower(split->>'method') WHEN 'cash' THEN 'cash' WHEN 'credit' THEN 'receivable' WHEN 'upi' THEN 'bank' WHEN 'card' THEN 'bank' WHEN 'bank' THEN 'bank' END;
         IF role IS NULL AND amount<>0 THEN RAISE EXCEPTION 'Unsupported split payment method'; END IF;
         lines:=lines||jsonb_build_array(jsonb_build_object('role',role,'amount',amount));
       END LOOP;
       IF total<>gross THEN RAISE EXCEPTION 'Split payments must equal invoice total'; END IF;
     ELSE
       role:=CASE lower(doc->>'payment_method') WHEN 'cash' THEN 'cash' WHEN 'credit' THEN 'receivable' WHEN 'upi' THEN 'bank' WHEN 'card' THEN 'bank' WHEN 'bank' THEN 'bank' WHEN 'cheque' THEN 'bank' END;
       IF role IS NULL THEN RAISE EXCEPTION 'Select Cash, Bank or Credit before posting invoice'; END IF;
       lines:=lines||jsonb_build_array(jsonb_build_object('role',role,'amount',gross));
     END IF;
     lines:=lines||jsonb_build_array(jsonb_build_object('role','sales','amount',-(gross-tax)),jsonb_build_object('role','outputTax','amount',-tax),
       jsonb_build_object('role','cogs','amount',cost),jsonb_build_object('role','stock','amount',-cost));
   END IF;
 ELSE
   -- Supplier payments already post through distributor accounting; never expense them again.
   active:=doc IS NOT NULL AND upper(doc->>'status') IN ('PAID','PENDING','UNPAID')
     AND NOT EXISTS(SELECT 1 FROM distributor_payments WHERE expense_id=sid AND company_id=c);
   IF active THEN
     tax:=round(COALESCE((doc->>'tax_amount')::numeric,0),2);
     IF gross<0 OR tax<0 OR tax>gross THEN RAISE EXCEPTION 'Invalid expense total or tax'; END IF;
     role:=CASE WHEN upper(doc->>'status')<>'PAID' THEN 'expensePayable' WHEN doc->>'payment_mode'='CASH' THEN 'cash' ELSE 'bank' END;
     lines:=jsonb_build_array(jsonb_build_object('role','expense','amount',gross-tax),jsonb_build_object('role','inputTax','amount',tax),jsonb_build_object('role',role,'amount',-gross));
   END IF;
 END IF;
 SELECT COALESCE(jsonb_agg(value),'[]') INTO lines FROM jsonb_array_elements(lines) WHERE (value->>'amount')::numeric<>0;
 sig:=jsonb_build_object('date',d,'reference',reference,'lines',lines,'costs',costs,'accounts',selected);
 IF prev.signature=sig THEN RETURN 0; END IF;
 IF lines<>'[]' THEN
   SELECT sum((value->>'amount')::numeric) INTO total FROM jsonb_array_elements(lines);
   IF total<>0 THEN RAISE EXCEPTION 'ERP journal is not balanced'; END IF;
   PERFORM accountant_v2_distributor_check_date(c,d,true);
   FOR l IN SELECT value FROM jsonb_array_elements(lines) LOOP
     role:=l->>'role'; account:=selected->>role;
     expected_type:=CASE role WHEN 'sales' THEN 'INCOME' WHEN 'cash' THEN 'CASH' WHEN 'bank' THEN 'BANK' WHEN 'receivable' THEN 'ACCOUNTS_RECEIVABLE'
       WHEN 'stock' THEN 'STOCK' WHEN 'cogs' THEN 'COST_OF_GOODS_SOLD' WHEN 'inputTax' THEN 'OTHER_CURRENT_ASSET'
       WHEN 'outputTax' THEN 'OTHER_CURRENT_LIABILITY' WHEN 'expensePayable' THEN 'OTHER_CURRENT_LIABILITY' WHEN 'expense' THEN 'EXPENSE' END;
     IF NOT EXISTS(SELECT 1 FROM accountant_v2_accounting_accounts WHERE id=account AND company_id=c AND account_type::text=expected_type AND is_active AND deleted_at IS NULL) THEN
       RAISE EXCEPTION 'Choose an active company account for ERP role %',role;
     END IF;
   END LOOP;
 END IF;
 rev:=COALESCE(prev.revision,0)+1;
 IF prev.journal_id IS NOT NULL THEN
   SELECT * INTO oldj FROM accountant_v2_manual_journals WHERE id=prev.journal_id;
   PERFORM accountant_v2_distributor_check_date(c,oldj.journal_date,true);
   rid:='c'||substr(md5(c||key||rev||':erp-reversal'),1,24);
   INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,reversed_from_id,updated_at)
   VALUES(rid,c,'ERP-R-'||rid,oldj.journal_date,'Reversal: '||reference,oldj.currency,oldj.total,'PUBLISHED',now(),true,'ERP_REVERSAL',rid,oldj.id,now());
   INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,updated_at)
   SELECT 'c'||substr(md5(rid||jl.id),1,24),c,rid,jl.account_id,(CASE jl.side WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END)::"AccountantJournalEntrySide",jl.amount,'Reversal: '||reference,now()
   FROM accountant_v2_manual_journal_lines jl WHERE jl.journal_id=oldj.id;
 END IF;
 IF lines<>'[]' THEN
   jid:='c'||substr(md5(c||key||rev||':erp-post'),1,24);
   SELECT sum((value->>'amount')::numeric) INTO total FROM jsonb_array_elements(lines) WHERE (value->>'amount')::numeric>0;
   INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,updated_at)
   VALUES(jid,c,'ERP-'||jid,d,reference,kind||': '||COALESCE(doc->>'notes',doc->>'note',''),COALESCE(doc->>'currency','INR'),total,'PUBLISHED',now(),true,'ERP_'||kind,key||':'||rev,now());
   FOR e IN SELECT value,ordinality FROM jsonb_array_elements(lines) WITH ORDINALITY LOOP
     amount:=(e.value->>'amount')::numeric;
     INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,updated_at)
     VALUES('c'||substr(md5(jid||e.ordinality),1,24),c,jid,selected->>(e.value->>'role'),(CASE WHEN amount>0 THEN 'DEBIT' ELSE 'CREDIT' END)::"AccountantJournalEntrySide",abs(amount),reference,now());
   END LOOP;
 END IF;
 INSERT INTO accountant_v2_erp_sources(company_id,source_key,signature,accounts,revision,journal_id) VALUES(c,key,sig,selected,rev,jid)
 ON CONFLICT(company_id,source_key) DO UPDATE SET signature=EXCLUDED.signature,accounts=EXCLUDED.accounts,revision=EXCLUDED.revision,journal_id=EXCLUDED.journal_id;
 INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
 VALUES('c'||substr(md5(c||key||rev||':erp-audit'),1,24),c,COALESCE(nullif(current_setting('app.accountant_user',true),''),'erp-source'),'post','erp-accounting',key,jsonb_build_object('journalId',jid,'previousJournalId',prev.journal_id,'revision',rev),now());
 RETURN 1;
END $$;

CREATE FUNCTION accountant_v2_erp_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text:=CASE WHEN TG_TABLE_NAME='bills' THEN 'BILL' ELSE 'EXPENSE' END;
BEGIN
 IF TG_OP<>'INSERT' THEN PERFORM accountant_v2_sync_erp(OLD.company_id,k,OLD.id); END IF;
 IF TG_OP<>'DELETE' THEN PERFORM accountant_v2_sync_erp(NEW.company_id,k,NEW.id,TG_OP='INSERT'); END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accountant_v2_erp_bill AFTER INSERT OR UPDATE OR DELETE ON bills DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_erp_changed();
CREATE CONSTRAINT TRIGGER accountant_v2_erp_expense AFTER INSERT OR UPDATE OR DELETE ON expenses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_erp_changed();
CREATE FUNCTION accountant_v2_erp_entry_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b record;
BEGIN
 FOR b IN SELECT id,company_id FROM bills WHERE id IN (CASE WHEN TG_OP<>'INSERT' THEN OLD.bill_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.bill_id END) LOOP
   PERFORM accountant_v2_sync_erp(b.company_id,'BILL',b.id);
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accountant_v2_erp_entry AFTER INSERT OR UPDATE OR DELETE ON entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_erp_entry_changed();
CREATE FUNCTION accountant_v2_erp_supplier_expense_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.expense_id IS NOT NULL THEN PERFORM accountant_v2_sync_erp(OLD.company_id,'EXPENSE',OLD.expense_id); END IF;
 IF TG_OP<>'DELETE' AND NEW.expense_id IS NOT NULL THEN PERFORM accountant_v2_sync_erp(NEW.company_id,'EXPENSE',NEW.expense_id); END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accountant_v2_erp_supplier_expense AFTER INSERT OR UPDATE OR DELETE ON distributor_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_erp_supplier_expense_changed();
