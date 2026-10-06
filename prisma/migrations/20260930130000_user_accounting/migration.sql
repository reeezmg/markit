CREATE TABLE accountant_v2_user_settings (
 company_id text PRIMARY KEY REFERENCES companies(id),
 enabled boolean NOT NULL DEFAULT false,
 accounts jsonb NOT NULL DEFAULT '{}',
 activated_at timestamp(3) NOT NULL DEFAULT now()
);
CREATE TABLE accountant_v2_user_sources (
 company_id text NOT NULL REFERENCES companies(id),source_key text NOT NULL,ledger_id text NOT NULL,
 signature jsonb NOT NULL DEFAULT '{}',accounts jsonb NOT NULL DEFAULT '{}',
 revision integer NOT NULL DEFAULT 0,journal_id text,
 PRIMARY KEY(company_id,source_key)
);
CREATE INDEX accountant_v2_user_sources_ledger ON accountant_v2_user_sources(company_id,ledger_id);
CREATE FUNCTION accountant_v2_user_key(t text,s text,sid text,lid text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT t||':'||s||':'||COALESCE(sid,lid)
$$;
CREATE FUNCTION accountant_v2_sync_user(c text,sid text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE cfg accountant_v2_user_settings; prev accountant_v2_user_sources; doc user_ledger_entries;
 key text; selected jsonb; sig jsonb; lines jsonb:='[]'; parties jsonb; label text;
 pay salary_payments; mt money_transactions; bank_id text; mode text; amount numeric; total numeric;
 d timestamp; reference text; reason text; role text; account text; expected_type text;
 rev integer; jid text; rid text; oldj accountant_v2_manual_journals; e record;
BEGIN
 SELECT * INTO cfg FROM accountant_v2_user_settings WHERE company_id=c AND enabled;
 IF NOT FOUND THEN RETURN 0; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('accountant-v2:'||c));
 SELECT * INTO doc FROM user_ledger_entries WHERE company_id=c AND id=sid;
 IF FOUND THEN
   key:=accountant_v2_user_key(doc.type::text,doc.source_type::text,doc.source_id,doc.id);
   SELECT * INTO prev FROM accountant_v2_user_sources WHERE company_id=c AND source_key=key;
 ELSE
   SELECT * INTO prev FROM accountant_v2_user_sources WHERE company_id=c AND ledger_id=sid;
   IF NOT FOUND THEN RETURN 0; END IF;
   key:=prev.source_key;
 END IF;
 IF prev.signature->>'excluded'='true' THEN RETURN 0; END IF;
 selected:=cfg.accounts||COALESCE(prev.accounts,'{}');
 d:=COALESCE(doc.created_at,(prev.signature->>'date')::timestamp,now());
 reference:=COALESCE(doc.note,prev.signature->>'reference','Staff transaction');
 parties:=COALESCE(prev.signature->'parties','{}');
 IF doc.id IS NOT NULL THEN
   SELECT name INTO label FROM company_users WHERE company_id=c AND user_id=doc.user_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Staff member does not belong to this company'; END IF;
   parties:=CASE WHEN parties->'user'->>'id'=doc.user_id THEN parties ELSE jsonb_build_object('user',jsonb_build_object('id',doc.user_id,'name',COALESCE(label,doc.user_id))) END;
   amount:=doc.amount;
   IF amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid staff ledger amount'; END IF;
   IF doc.type='USER_CREDIT_BILL' AND doc.source_type='BILL' THEN
     reason:='Posted through ERP bill';
   ELSIF doc.type='SALARY_PAYMENT' AND doc.source_type='PAYROLL' THEN
     reason:='Included in payroll credit settlement';
   ELSIF doc.type='PAYROLL_ACCRUAL' THEN
     IF doc.direction='DEBIT' THEN amount:=-amount; END IF;
     lines:=jsonb_build_array(jsonb_build_object('role','salaryExpense','amount',amount),jsonb_build_object('role','salaryPayable','amount',-amount));
   ELSIF doc.type='SALARY_PAYMENT' AND doc.source_type='SALARY_PAYMENT' THEN
     SELECT * INTO pay FROM salary_payments WHERE company_id=c AND id=doc.source_id AND user_id=doc.user_id;
     IF NOT FOUND THEN RAISE EXCEPTION 'Salary payment source is missing or belongs to another staff member'; END IF;
     -- Legacy staff ledger amounts may include credit cuts; only actual money leaves the bank.
     amount:=pay.amount;mode:=pay.payment_mode::text;bank_id:=pay.bank_account_id;d:=pay.payment_date;
     IF amount<=0 OR doc.direction<>'DEBIT' THEN RAISE EXCEPTION 'Invalid salary payout'; END IF;
     role:=CASE WHEN mode='CASH' THEN 'cash' WHEN bank_id IS NOT NULL THEN 'bank:'||bank_id ELSE 'bank' END;
     lines:=jsonb_build_array(jsonb_build_object('role','salaryPayable','amount',amount),jsonb_build_object('role',role,'amount',-amount));
   ELSIF doc.type='CREDIT_BILL_PAYMENT' AND doc.source_type='PAYROLL' THEN
     IF doc.direction<>'CREDIT' THEN RAISE EXCEPTION 'Invalid payroll credit settlement'; END IF;
     lines:=jsonb_build_array(jsonb_build_object('role','salaryPayable','amount',amount),jsonb_build_object('role','receivable','amount',-amount));
   ELSIF doc.source_type='MANUAL' AND doc.type IN ('USER_CREDIT_BILL','CREDIT_BILL_PAYMENT') THEN
     SELECT * INTO mt FROM money_transactions WHERE company_id=c AND id=doc.id;
     IF NOT FOUND OR mt.amount<>amount OR mt.party_type::text<>'EMPLOYEE' OR mt.status::text<>'PAID' THEN RAISE EXCEPTION 'Staff cash transaction is missing or inconsistent'; END IF;
     IF (doc.type='USER_CREDIT_BILL' AND (doc.direction<>'DEBIT' OR mt.direction::text<>'GIVEN')) OR
        (doc.type='CREDIT_BILL_PAYMENT' AND (doc.direction<>'CREDIT' OR mt.direction::text<>'RECEIVED')) THEN RAISE EXCEPTION 'Staff credit direction disagrees with money transaction'; END IF;
     bank_id:=mt.account_id;mode:=mt.payment_mode::text;
     IF doc.type='CREDIT_BILL_PAYMENT' THEN amount:=-amount; END IF;
     role:=CASE WHEN mode='CASH' THEN 'cash' WHEN bank_id IS NOT NULL THEN 'bank:'||bank_id ELSE 'bank' END;
     lines:=jsonb_build_array(jsonb_build_object('role','receivable','amount',amount),jsonb_build_object('role',role,'amount',-amount));
   ELSIF doc.type IN ('OPENING','ADJUSTMENT') THEN
     IF doc.direction='DEBIT' THEN amount:=-amount; END IF;
     lines:=jsonb_build_array(jsonb_build_object('role','opening','amount',amount),jsonb_build_object('role','salaryPayable','amount',-amount));
   ELSE RAISE EXCEPTION 'Unsupported staff accounting source % / %',doc.type,doc.source_type;
   END IF;
 END IF;
 IF bank_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bank_accounts WHERE company_id=c AND id=bank_id) THEN RAISE EXCEPTION 'Bank belongs to another company'; END IF;
 sig:=jsonb_build_object('date',d,'reference',reference,'lines',lines,'parties',parties,'reason',reason,'accounts',selected);
 IF prev.signature=sig THEN RETURN 0; END IF;
 IF lines<>'[]' THEN
   SELECT sum((value->>'amount')::numeric) INTO total FROM jsonb_array_elements(lines);
   IF total<>0 THEN RAISE EXCEPTION 'Staff journal is not balanced'; END IF;
   PERFORM accountant_v2_distributor_check_date(c,d,true);
   FOR e IN SELECT value FROM jsonb_array_elements(lines) LOOP
     role:=e.value->>'role';account:=selected->>role;
     expected_type:=CASE WHEN role='salaryExpense' THEN 'EXPENSE' WHEN role='salaryPayable' THEN 'OTHER_CURRENT_LIABILITY' WHEN role='receivable' THEN 'ACCOUNTS_RECEIVABLE' WHEN role='cash' THEN 'CASH' WHEN role='opening' THEN 'OTHER_CURRENT_LIABILITY' ELSE 'BANK' END;
     IF NOT EXISTS(SELECT 1 FROM accountant_v2_accounting_accounts WHERE company_id=c AND id=account AND account_type::text=expected_type AND is_active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Choose an active staff accounting account for %',role; END IF;
   END LOOP;
 END IF;
 rev:=COALESCE(prev.revision,0)+1;
 IF prev.journal_id IS NOT NULL THEN
   SELECT * INTO oldj FROM accountant_v2_manual_journals WHERE company_id=c AND id=prev.journal_id;
   PERFORM accountant_v2_distributor_check_date(c,oldj.journal_date,true);
   rid:='c'||substr(md5(c||key||rev||':user-reversal'),1,24);
   INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,reversed_from_id,updated_at)
   VALUES(rid,c,'STAFF-R-'||rid,oldj.journal_date,'Reversal: '||reference,oldj.currency,oldj.total,'PUBLISHED',now(),true,'USER_REVERSAL',rid,oldj.id,now());
   INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,source_parties,updated_at)
   SELECT 'c'||substr(md5(rid||l.id),1,24),c,rid,l.account_id,(CASE l.side WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END)::"AccountantJournalEntrySide",l.amount,'Reversal: '||reference,l.source_parties,now() FROM accountant_v2_manual_journal_lines l WHERE l.journal_id=oldj.id AND l.company_id=c AND l.deleted_at IS NULL;
 END IF;
 IF lines<>'[]' THEN
   jid:='c'||substr(md5(c||key||rev||':user-post'),1,24);
   SELECT sum((value->>'amount')::numeric) INTO total FROM jsonb_array_elements(lines) WHERE (value->>'amount')::numeric>0;
   INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,updated_at)
   VALUES(jid,c,'STAFF-'||substr(jid,2,10),d,doc.type::text,reference,COALESCE((SELECT currency FROM companies WHERE id=c),'INR'),total,'PUBLISHED',now(),true,'USER_LEDGER',key||':'||rev,now());
   FOR e IN SELECT value,ordinality FROM jsonb_array_elements(lines) WITH ORDINALITY LOOP
     amount:=(e.value->>'amount')::numeric;
     INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,source_parties,updated_at)
     VALUES('c'||substr(md5(jid||e.ordinality),1,24),c,jid,selected->>(e.value->>'role'),(CASE WHEN amount>0 THEN 'DEBIT' ELSE 'CREDIT' END)::"AccountantJournalEntrySide",abs(amount),reference,parties,now());
   END LOOP;
 END IF;
 INSERT INTO accountant_v2_user_sources(company_id,source_key,ledger_id,signature,accounts,revision,journal_id) VALUES(c,key,sid,sig,selected,rev,jid)
 ON CONFLICT(company_id,source_key) DO UPDATE SET ledger_id=EXCLUDED.ledger_id,signature=EXCLUDED.signature,accounts=EXCLUDED.accounts,revision=EXCLUDED.revision,journal_id=EXCLUDED.journal_id;
 INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
 VALUES('c'||substr(md5(c||key||rev||':user-audit'),1,24),c,COALESCE(nullif(current_setting('app.accountant_user',true),''),'staff-source'),'post','user-accounting',key,jsonb_build_object('journalId',jid,'previousJournalId',prev.journal_id,'revision',rev,'ledgerId',sid),now());
 RETURN 1;
END $$;
CREATE FUNCTION accountant_v2_user_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record; old_c text; new_c text; old_id text; new_id text;
BEGIN
 IF TG_OP<>'INSERT' THEN old_c:=OLD.company_id;old_id:=OLD.id; END IF;
 IF TG_OP<>'DELETE' THEN new_c:=NEW.company_id;new_id:=NEW.id; END IF;
 IF TG_TABLE_NAME='user_ledger_entries' THEN
   IF old_c IS NOT NULL THEN PERFORM accountant_v2_sync_user(old_c,old_id); END IF;
   IF new_c IS NOT NULL THEN PERFORM accountant_v2_sync_user(new_c,new_id); END IF;
 ELSE
   FOR r IN SELECT company_id,id FROM user_ledger_entries WHERE company_id IN(old_c,new_c) AND (
     (TG_TABLE_NAME='salary_payments' AND source_type='SALARY_PAYMENT' AND source_id IN(old_id,new_id)) OR
     (TG_TABLE_NAME='money_transactions' AND source_type='MANUAL' AND id IN(old_id,new_id))) LOOP
     PERFORM accountant_v2_sync_user(r.company_id,r.id);
   END LOOP;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accountant_v2_user_ledger AFTER INSERT OR UPDATE OR DELETE ON user_ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_user_changed();
CREATE CONSTRAINT TRIGGER accountant_v2_user_payment AFTER INSERT OR UPDATE OR DELETE ON salary_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_user_changed();
CREATE CONSTRAINT TRIGGER accountant_v2_user_money AFTER INSERT OR UPDATE OR DELETE ON money_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_user_changed();
