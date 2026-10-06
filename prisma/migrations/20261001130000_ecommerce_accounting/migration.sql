CREATE TABLE accountant_v2_ecommerce_settings (
 company_id text PRIMARY KEY REFERENCES companies(id),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 accounts jsonb NOT NULL DEFAULT '{}'
);

-- Signed amounts are debit-positive. Revision journals retain original evidence.
CREATE FUNCTION accountant_v2_post_ecommerce(c text, k text, d timestamp, rows jsonb, mappings jsonb, metadata jsonb)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE prior accountant_v2_erp_sources; sig jsonb; jid text; rid text; rev integer;
 oldj accountant_v2_manual_journals; line record; amount numeric; total numeric; role text; typ text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('accountant-v2:'||c));
 SELECT * INTO prior FROM accountant_v2_erp_sources WHERE company_id=c AND source_key=k;
 SELECT COALESCE(jsonb_agg(value),'[]') INTO rows FROM jsonb_array_elements(rows) WHERE (value->>'amount')::numeric<>0;
 sig:=jsonb_build_object('date',d,'lines',rows,'accounts',mappings,'metadata',metadata);
 IF prior.signature=sig THEN RETURN 0; END IF;
 IF rows<>'[]' THEN
   SELECT sum((value->>'amount')::numeric) INTO total FROM jsonb_array_elements(rows);
   IF total<>0 THEN RAISE EXCEPTION 'Ecommerce journal is not balanced'; END IF;
   PERFORM accountant_v2_distributor_check_date(c,d,true);
   FOR line IN SELECT value FROM jsonb_array_elements(rows) LOOP
     role:=line.value->>'role';
     typ:=CASE role WHEN 'receivable' THEN 'ACCOUNTS_RECEIVABLE' WHEN 'sales' THEN 'INCOME'
       WHEN 'deliveryIncome' THEN 'INCOME' WHEN 'codIncome' THEN 'INCOME' WHEN 'outputTax' THEN 'OTHER_CURRENT_LIABILITY'
       WHEN 'stock' THEN 'STOCK' WHEN 'cogs' THEN 'COST_OF_GOODS_SOLD' WHEN 'codClearing' THEN 'PAYMENT_CLEARING_ACCOUNT'
       WHEN 'gatewayClearing' THEN 'PAYMENT_CLEARING_ACCOUNT' WHEN 'refundPayable' THEN 'OTHER_CURRENT_LIABILITY'
       WHEN 'shippingExpense' THEN 'EXPENSE' WHEN 'gatewayExpense' THEN 'EXPENSE' WHEN 'loyaltyExpense' THEN 'EXPENSE' WHEN 'cash' THEN 'CASH'
       WHEN 'bank' THEN 'BANK' WHEN 'inputTax' THEN 'OTHER_CURRENT_ASSET' WHEN 'expensePayable' THEN 'OTHER_CURRENT_LIABILITY' END;
     IF typ IS NULL OR NOT EXISTS(SELECT 1 FROM accountant_v2_accounting_accounts
       WHERE id=mappings->>role AND company_id=c AND account_type::text=typ AND is_active AND deleted_at IS NULL) THEN
       RAISE EXCEPTION 'Select an active company account for ecommerce role %',role;
     END IF;
   END LOOP;
 END IF;
 rev:=COALESCE(prior.revision,0)+1;
 IF prior.journal_id IS NOT NULL THEN
   SELECT * INTO oldj FROM accountant_v2_manual_journals WHERE id=prior.journal_id AND company_id=c;
   PERFORM accountant_v2_distributor_check_date(c,oldj.journal_date,true);
   rid:='c'||substr(md5(c||k||rev||':ecommerce-reversal'),1,24);
   INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,reversed_from_id,updated_at)
   VALUES(rid,c,'EC-R-'||rid,oldj.journal_date,'Ecommerce correction: '||k,oldj.currency,oldj.total,'PUBLISHED',now(),true,'ECOMMERCE_REVERSAL',rid,oldj.id,now());
   INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,source_parties,updated_at)
   SELECT 'c'||substr(md5(rid||l.id),1,24),c,rid,l.account_id,(CASE l.side WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END)::"AccountantJournalEntrySide",l.amount,'Ecommerce correction',l.source_parties,now()
   FROM accountant_v2_manual_journal_lines l WHERE l.journal_id=oldj.id AND l.company_id=c;
 END IF;
 IF rows<>'[]' THEN
   jid:='c'||substr(md5(c||k||rev||':ecommerce-post'),1,24);
   SELECT sum((value->>'amount')::numeric) INTO total FROM jsonb_array_elements(rows) WHERE (value->>'amount')::numeric>0;
   INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,updated_at)
   VALUES(jid,c,'EC-'||jid,d,metadata->>'reference',COALESCE(metadata->>'note',k),(SELECT COALESCE(currency,'INR') FROM companies WHERE id=c),total,'PUBLISHED',now(),true,'ECOMMERCE',k||':'||rev,now());
   FOR line IN SELECT value,ordinality FROM jsonb_array_elements(rows) WITH ORDINALITY LOOP
     amount:=(line.value->>'amount')::numeric;
     INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,source_parties,updated_at)
     VALUES('c'||substr(md5(jid||line.ordinality),1,24),c,jid,mappings->>(line.value->>'role'),(CASE WHEN amount>0 THEN 'DEBIT' ELSE 'CREDIT' END)::"AccountantJournalEntrySide",abs(amount),line.value->>'role',metadata->'parties',now());
   END LOOP;
 END IF;
 INSERT INTO accountant_v2_erp_sources(company_id,source_key,signature,accounts,revision,journal_id)
 VALUES(c,k,sig,mappings,rev,jid) ON CONFLICT(company_id,source_key) DO UPDATE SET
 signature=EXCLUDED.signature,accounts=EXCLUDED.accounts,revision=EXCLUDED.revision,journal_id=EXCLUDED.journal_id;
 INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
 VALUES('c'||substr(md5(c||k||rev||':audit'),1,24),c,COALESCE(nullif(current_setting('app.status_actor',true),''),'ecommerce-source'),'post','ecommerce-accounting',k,sig||jsonb_build_object('journalId',jid,'revision',rev),now());
 RETURN 1;
END $$;

CREATE FUNCTION accountant_v2_sync_ecommerce(c text, oid text, importing boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE cfg accountant_v2_ecommerce_settings; sale accountant_v2_erp_sources; receipt accountant_v2_erp_sources;
 doc jsonb; ord jsonb; selected jsonb; meta jsonb; costs jsonb; rows jsonb; e record; items jsonb:='[]';
 gross numeric; tax numeric; delivery numeric; cod numeric; cost numeric:=0; unitcost numeric; redeemed numeric; subtotal numeric; discount numeric;
 d timestamp; paid_date timestamp; canceled boolean; changed integer:=0; collection numeric:=0;
 clearing text; active_total numeric; key text:='ecommerce-sale:'||oid; refund_due numeric; delta numeric; refund_revision integer;
BEGIN
 SELECT * INTO cfg FROM accountant_v2_ecommerce_settings WHERE company_id=c AND enabled;
 IF NOT FOUND THEN RETURN 0; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('accountant-v2:'||c));
 SELECT * INTO sale FROM accountant_v2_erp_sources WHERE company_id=c AND source_key=key;
 IF sale.signature->>'excluded'='true' AND NOT importing THEN RETURN 0; END IF;
 SELECT to_jsonb(o),to_jsonb(b) INTO ord,doc FROM ecomm_orders o JOIN bills b ON b.id=o.bill_id AND b.company_id=o.company_id
 WHERE o.id=oid AND o.company_id=c;
 IF ord IS NULL THEN
   -- Financial source deletion is not evidence of a refund or a stock return.
   IF sale.source_key IS NOT NULL AND COALESCE(sale.signature->>'excluded','false')<>'true' THEN RAISE EXCEPTION 'Cancel the ecommerce order instead of deleting its accounting source'; END IF;
   RETURN 0;
 END IF;
 IF sale.source_key IS NULL AND NOT importing AND (ord->>'created_at')::timestamp<cfg.activated_at THEN RETURN 0; END IF;
 IF EXISTS(SELECT 1 FROM accountant_v2_erp_sources WHERE company_id=c AND source_key='bill:'||(doc->>'id') AND journal_id IS NOT NULL) THEN
   RAISE EXCEPTION 'This ecommerce bill already has ERP postings; reconcile them before connecting';
 END IF;
 selected:=CASE WHEN sale.accounts<>'{}' THEN sale.accounts ELSE cfg.accounts END;
 costs:=COALESCE(sale.signature->'metadata'->'costs','{}');
 meta:=jsonb_build_object('orderId',oid,'billId',doc->>'id','reference','Order '||(ord->>'order_number'),
   'parties',accountant_v2_erp_parties(c,'BILL',doc,COALESCE(sale.signature->'metadata'->'parties','{}'))||jsonb_build_object('ecommerceOrder',jsonb_build_object('id',oid,'billId',doc->>'id')));
 gross:=round(COALESCE((doc->>'grand_total')::numeric,0),2);
 tax:=round(COALESCE((doc->>'tax')::numeric,0),2);
 delivery:=round(COALESCE((doc->>'delivery_fee')::numeric,0),2);
 cod:=round(COALESCE((doc->>'cod_charge')::numeric,0),2);
 redeemed:=round(COALESCE((doc->>'redeemed_points')::numeric,0),2);
 subtotal:=round(COALESCE((doc->>'subtotal')::numeric,0),2);
 discount:=round(COALESCE((doc->>'discount')::numeric,0),2);
 -- Inclusive checkout tax is stored before the coupon; scale it across the
 -- discounted merchandise only. Exclusive tax is already charged on top.
 IF abs(gross+redeemed-(subtotal+delivery+cod-discount))<=0.01 AND subtotal>0 THEN
   tax:=round(tax*greatest(0,subtotal-discount)/subtotal,2);
 END IF;
 IF gross<0 OR tax<0 OR delivery<0 OR cod<0 OR redeemed<0 OR gross+redeemed<tax+delivery+cod THEN
   RAISE EXCEPTION 'Ecommerce bill totals need review before posting';
 END IF;
 FOR e IN SELECT x.*,v.p_price FROM entries x LEFT JOIN variants v ON v.id=x.variant_id WHERE x.bill_id=doc->>'id' AND x.company_id=c LOOP
   unitcost:=COALESCE((costs->>(e.id||':'||COALESCE(e.variant_id,'')))::numeric,e.p_price::numeric,0);
   costs:=costs||jsonb_build_object(e.id||':'||COALESCE(e.variant_id,''),unitcost);
   cost:=cost+unitcost*COALESCE(e.qty,0)*CASE WHEN e.return THEN -1 ELSE 1 END;
   items:=items||jsonb_build_array(jsonb_build_object('entryId',e.id,'itemId',e.item_id,'name',COALESCE(to_jsonb(e)->>'name','Product'),'size',to_jsonb(e)->>'size','qty',e.qty,'value',e.value,'unitCost',unitcost,'returned',e.return));
 END LOOP;
 SELECT COALESCE(jsonb_agg(value ORDER BY value->>'entryId'),'[]') INTO items FROM jsonb_array_elements(items);
 meta:=meta||jsonb_build_object('costs',costs,'items',items,'gross',gross,'tax',tax,'delivery',delivery,'cod',cod,'redeemed',redeemed,'cost',round(cost,2));
 canceled:=COALESCE(ord->>'status','') IN ('CANCELLED','CANCELED') OR COALESCE(doc->>'status','') IN ('CANCELLED','CANCELED') OR COALESCE((doc->>'deleted')::boolean,false);
 IF EXISTS(SELECT 1 FROM accountant_v2_erp_sources WHERE company_id=c AND signature->'metadata'->>'orderId'=oid AND signature->'metadata'->>'action'='RETURN')
    AND (canceled OR meta IS DISTINCT FROM sale.signature->'metadata') THEN
   RAISE EXCEPTION 'This order has accounted returns; keep its original invoice and record further returns instead';
 END IF;
 d:=(doc->>'created_at')::timestamp;
 rows:=CASE WHEN canceled THEN '[]'::jsonb ELSE jsonb_build_array(
   jsonb_build_object('role','receivable','amount',gross),jsonb_build_object('role','loyaltyExpense','amount',redeemed),jsonb_build_object('role','sales','amount',-(gross+redeemed-tax-delivery-cod)),
   jsonb_build_object('role','outputTax','amount',-tax),jsonb_build_object('role','deliveryIncome','amount',-delivery),jsonb_build_object('role','codIncome','amount',-cod),
   jsonb_build_object('role','cogs','amount',round(cost,2)),jsonb_build_object('role','stock','amount',-round(cost,2))) END;
 changed:=changed+accountant_v2_post_ecommerce(c,key,d,rows,selected,meta);
 SELECT * INTO receipt FROM accountant_v2_erp_sources WHERE company_id=c AND source_key='ecommerce-collection:'||oid;
 -- A recorded collection remains a real asset after cancellation. Never turn
 -- it into bank cash until an explicit carrier/gateway settlement is recorded.
 IF receipt.source_key IS NULL AND doc->>'payment_status'='PAID' THEN
   SELECT COALESCE(sum((signature->'metadata'->>'receiptAmount')::numeric),0) INTO collection
   FROM accountant_v2_erp_sources WHERE company_id=c AND signature->'metadata'->>'orderId'=oid AND signature->'metadata'->>'action'='RECEIPT';
   paid_date:=(doc->>'paid_at')::timestamptz AT TIME ZONE 'UTC';
   IF paid_date IS NULL THEN RAISE EXCEPTION 'Paid ecommerce order has no proven paid date; record it before importing'; END IF;
   clearing:=CASE upper(doc->>'payment_method') WHEN 'COD' THEN 'codClearing' WHEN 'CASH' THEN 'cash' ELSE 'gatewayClearing' END;
   collection:=greatest(0,gross-collection);
   changed:=changed+accountant_v2_post_ecommerce(c,'ecommerce-collection:'||oid,paid_date,jsonb_build_array(
     jsonb_build_object('role',clearing,'amount',collection),jsonb_build_object('role','receivable','amount',-collection)),selected,
     meta||jsonb_build_object('collected',collection,'clearing',clearing));
 END IF;
 -- Credit notes reduce the amount due; refunds discharge the resulting payable.
 SELECT COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0) INTO active_total
 FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 WHERE l.company_id=c AND l.source_parties->'ecommerceOrder'->>'id'=oid
 AND l.account_id=selected->>'receivable' AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL
 AND j.source_id NOT LIKE 'ecommerce-refund-adjustment:%' AND NOT (j.source_type='ECOMMERCE_REVERSAL' AND j.reversed_from_id IN
   (SELECT id FROM accountant_v2_manual_journals WHERE company_id=c AND source_id LIKE 'ecommerce-refund-adjustment:%'));
 refund_due:=greatest(0,-active_total);
 SELECT * INTO receipt FROM accountant_v2_erp_sources WHERE company_id=c AND source_key='ecommerce-refund-due:'||oid;
 delta:=refund_due-COALESCE((receipt.signature->>'totalDue')::numeric,0);
 IF delta<>0 THEN
   refund_revision:=COALESCE(receipt.revision,0)+1;
   d:=COALESCE(NULLIF(current_setting('app.ecommerce_event_date',true),'')::timestamp,now());
   rows:=jsonb_build_array(jsonb_build_object('role','receivable','amount',delta),jsonb_build_object('role','refundPayable','amount',-delta));
   changed:=changed+accountant_v2_post_ecommerce(c,'ecommerce-refund-adjustment:'||oid||':'||refund_revision,d,rows,selected,
     jsonb_build_object('orderId',oid,'reference',meta->>'reference','parties',meta->'parties'));
   INSERT INTO accountant_v2_erp_sources(company_id,source_key,signature,accounts,revision)
   VALUES(c,'ecommerce-refund-due:'||oid,jsonb_build_object('totalDue',refund_due),selected,refund_revision)
   ON CONFLICT(company_id,source_key) DO UPDATE SET signature=EXCLUDED.signature,revision=EXCLUDED.revision;
 END IF;
 RETURN changed;
END $$;

CREATE FUNCTION accountant_v2_ecommerce_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rec record;
BEGIN
 IF TG_TABLE_NAME='ecomm_orders' THEN
   IF TG_OP<>'INSERT' THEN PERFORM accountant_v2_sync_ecommerce(OLD.company_id,OLD.id); END IF;
   IF TG_OP<>'DELETE' THEN PERFORM accountant_v2_sync_ecommerce(NEW.company_id,NEW.id); END IF;
 ELSE
   FOR rec IN SELECT id,company_id FROM ecomm_orders WHERE bill_id IN
     (CASE WHEN TG_OP<>'INSERT' THEN OLD.bill_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.bill_id END) LOOP
     PERFORM accountant_v2_sync_ecommerce(rec.company_id,rec.id);
   END LOOP;
 END IF;
 RETURN NULL;
END $$;
-- ERP-prefixed constraints are included in the existing stock-control flush.
CREATE CONSTRAINT TRIGGER accountant_v2_erp_ecommerce_order AFTER INSERT OR UPDATE OR DELETE ON ecomm_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_ecommerce_changed();
CREATE CONSTRAINT TRIGGER accountant_v2_erp_ecommerce_entry AFTER INSERT OR UPDATE OR DELETE ON entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_ecommerce_changed();

-- Preserve existing POS/expense posting; route linked ecommerce bills once.
CREATE OR REPLACE FUNCTION accountant_v2_sync_erp(c text, kind text, sid text, force_import boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE cfg accountant_v2_erp_settings; prev accountant_v2_erp_sources;
 doc jsonb; parties jsonb; selected jsonb; sig jsonb; lines jsonb:='[]'; costs jsonb:='{}';
 e record; l jsonb; split jsonb; gross numeric; tax numeric; base numeric; cost numeric:=0;
 amount numeric; total numeric; entry_tax numeric; role text; account text; expected_type text;
 d timestamp; reference text; key text:=lower(kind)||':'||sid;
 jid text; rid text; oldj accountant_v2_manual_journals; rev integer; active boolean:=false;
BEGIN
 -- Linked ecommerce invoices use their order as the sole accounting source.
 IF kind='BILL' AND EXISTS(SELECT 1 FROM ecomm_orders o JOIN accountant_v2_ecommerce_settings ecfg ON ecfg.company_id=o.company_id AND ecfg.enabled
     WHERE o.bill_id=sid AND o.company_id=c AND o.created_at>=ecfg.activated_at) THEN
   RETURN accountant_v2_sync_ecommerce(c,(SELECT id FROM ecomm_orders WHERE bill_id=sid AND company_id=c));
 END IF;
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
 parties:=CASE WHEN doc IS NULL THEN COALESCE(prev.signature->'parties','{}'::jsonb) ELSE accountant_v2_erp_parties(c,kind,doc,COALESCE(prev.signature->'parties','{}'::jsonb)) END;
 selected:=CASE WHEN prev.accounts<>'{}' THEN prev.accounts ELSE cfg.accounts END;
 costs:=COALESCE(prev.signature->'costs','{}'::jsonb);
 gross:=round(COALESCE((doc->>CASE WHEN kind='BILL' THEN 'grand_total' ELSE 'total_amount' END)::numeric,0),2);
 d:=COALESCE((doc->>CASE WHEN kind='BILL' THEN 'created_at' ELSE 'expense_date' END)::timestamp,(prev.signature->>'date')::timestamp,now());
 reference:=CASE WHEN doc IS NULL THEN prev.signature->>'reference' WHEN kind='BILL' THEN 'INV-'||COALESCE(doc->>'invoice_number',sid) ELSE 'EXP-'||COALESCE(doc->>'expense_number',sid) END;
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
     tax:=round(COALESCE((doc->>'recoverable_tax_amount')::numeric,0),2);
     IF gross<0 OR tax<0 OR tax>gross THEN RAISE EXCEPTION 'Invalid expense total or tax'; END IF;
     role:=CASE WHEN upper(doc->>'status')<>'PAID' THEN 'expensePayable' WHEN doc->>'payment_mode'='CASH' THEN 'cash' ELSE 'bank' END;
     lines:=jsonb_build_array(jsonb_build_object('role','expense','amount',gross-tax),jsonb_build_object('role','inputTax','amount',tax),jsonb_build_object('role',role,'amount',-gross));
   END IF;
 END IF;
 SELECT COALESCE(jsonb_agg(value),'[]') INTO lines FROM jsonb_array_elements(lines) WHERE (value->>'amount')::numeric<>0;
 sig:=jsonb_build_object('date',d,'reference',reference,'lines',lines,'costs',costs,'accounts',selected,'parties',parties);
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
   INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,source_parties,updated_at)
   SELECT 'c'||substr(md5(rid||jl.id),1,24),c,rid,jl.account_id,(CASE jl.side WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END)::"AccountantJournalEntrySide",jl.amount,'Reversal: '||reference,jl.source_parties,now()
   FROM accountant_v2_manual_journal_lines jl WHERE jl.journal_id=oldj.id;
 END IF;
 IF lines<>'[]' THEN
   jid:='c'||substr(md5(c||key||rev||':erp-post'),1,24);
   SELECT sum((value->>'amount')::numeric) INTO total FROM jsonb_array_elements(lines) WHERE (value->>'amount')::numeric>0;
   INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,updated_at)
   VALUES(jid,c,'ERP-'||jid,d,reference,kind||': '||COALESCE(doc->>'notes',doc->>'note',''),COALESCE(doc->>'currency','INR'),total,'PUBLISHED',now(),true,'ERP_'||kind,key||':'||rev,now());
   FOR e IN SELECT value,ordinality FROM jsonb_array_elements(lines) WITH ORDINALITY LOOP
     amount:=(e.value->>'amount')::numeric;
     INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,source_parties,updated_at)
     VALUES('c'||substr(md5(jid||e.ordinality),1,24),c,jid,selected->>(e.value->>'role'),(CASE WHEN amount>0 THEN 'DEBIT' ELSE 'CREDIT' END)::"AccountantJournalEntrySide",abs(amount),reference,parties,now());
   END LOOP;
 END IF;
 INSERT INTO accountant_v2_erp_sources(company_id,source_key,signature,accounts,revision,journal_id) VALUES(c,key,sig,selected,rev,jid)
 ON CONFLICT(company_id,source_key) DO UPDATE SET signature=EXCLUDED.signature,accounts=EXCLUDED.accounts,revision=EXCLUDED.revision,journal_id=EXCLUDED.journal_id;
 INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
 VALUES('c'||substr(md5(c||key||rev||':erp-audit'),1,24),c,COALESCE(nullif(current_setting('app.accountant_user',true),''),'erp-source'),'post','erp-accounting',key,jsonb_build_object('journalId',jid,'previousJournalId',prev.journal_id,'revision',rev),now());
 RETURN 1;
END $$;
