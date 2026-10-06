-- Distributor integration: transaction-bound posting covers SQL, Prisma and cascades.
CREATE TABLE accountant_v2_distributor_settings (
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  distributor_id text NOT NULL REFERENCES distributors(id) ON DELETE RESTRICT,
  contact_id text NOT NULL REFERENCES accountant_v2_accountant_contact(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, distributor_id), UNIQUE (contact_id)
);
CREATE TABLE accountant_v2_distributor_mappings (
  company_id text NOT NULL,
  distributor_id text NOT NULL,
  role text NOT NULL,
  account_id text NOT NULL REFERENCES accountant_v2_accounting_accounts(id) ON DELETE RESTRICT,
  PRIMARY KEY (company_id, distributor_id, role),
  FOREIGN KEY (company_id, distributor_id) REFERENCES accountant_v2_distributor_settings(company_id, distributor_id) ON DELETE CASCADE
);
CREATE TABLE accountant_v2_distributor_sources (
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  distributor_id text NOT NULL REFERENCES distributors(id) ON DELETE RESTRICT,
  source_key text NOT NULL,
  signature jsonb NOT NULL,
  accounts jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  journal_id text REFERENCES accountant_v2_manual_journals(id) ON DELETE RESTRICT,
  PRIMARY KEY (company_id, distributor_id, source_key)
);
CREATE INDEX accountant_v2_distributor_sources_journal_idx ON accountant_v2_distributor_sources(journal_id);
ALTER TABLE accountant_v2_manual_journal_lines ADD COLUMN distributor_id text REFERENCES distributors(id) ON DELETE RESTRICT;
CREATE INDEX accountant_v2_journal_lines_distributor_idx ON accountant_v2_manual_journal_lines(company_id, distributor_id);

-- The projection is also used by preview/reconciliation. A cash PO needs its
-- purchase side even though the legacy transaction table only stored payment.
CREATE VIEW accountant_v2_distributor_events AS
SELECT c.company_id, c.distributor_id, 'credit:' || c.id AS source_key,
  CASE WHEN c.money_transaction_id IS NOT NULL THEN 'RECEIPT' ELSE 'PURCHASE' END AS kind,
  c.created_at AS event_date, round(c.amount::numeric,2) AS amount,
  0::numeric AS tax, COALESCE(m.payment_mode::text,'CASH') AS mode,
  m.account_id AS bank_id, COALESCE(c.remarks,'') AS description,
  COALESCE(c."billNo", 'DC-' || c.credit_no::text, c.id) AS reference
FROM distributor_credits c LEFT JOIN money_transactions m ON m.id=c.money_transaction_id AND m.company_id=c.company_id
WHERE c.purchase_order_id IS NULL
UNION ALL
SELECT p.company_id,p.distributor_id,'purchase:' || p.id,'PURCHASE',p.created_at,
  round(p.total_amount::numeric,2),round(COALESCE(p.tax,0)::numeric,2),NULL,NULL,
  'Purchase order',COALESCE(p.bill_no,'PO-' || p.purchase_order_no::text,p.id)
FROM purchase_orders p WHERE p.distributor_id IS NOT NULL AND p.payment_type IS NOT NULL AND p.total_amount<>0
UNION ALL
SELECT p.company_id,p.distributor_id,'payment:' || p.id,
  CASE WHEN p.payment_type::text='RETURN' THEN 'RETURN' ELSE 'PAYMENT' END,
  COALESCE(r.created_at,p.created_at),round(p.amount::numeric,2),round(COALESCE(r.tax_amount,0)::numeric,2),
  COALESCE(p.payment_type::text,'CASH'),NULL,COALESCE(p.remarks,''),
  COALESCE('PR-' || r.return_no::text,'DP-' || p.payment_no::text,p.id)
FROM distributor_payments p LEFT JOIN purchase_returns r ON r.id=p.purchase_return_id AND r.company_id=p.company_id
UNION ALL
SELECT d.company_id,d.distributor_id,'opening','OPENING',
  COALESCE(d.opening_due_date, (SELECT min(x.created_at) FROM (
    SELECT created_at FROM distributor_credits WHERE company_id=d.company_id AND distributor_id=d.distributor_id
    UNION ALL SELECT created_at FROM distributor_payments WHERE company_id=d.company_id AND distributor_id=d.distributor_id
  ) x) - interval '1 millisecond', timestamp '1970-01-01'),
  round(COALESCE(d.opening_due,0)::numeric,2),0,NULL,NULL,'Distributor opening balance','Opening'
FROM distributor_companies d WHERE COALESCE(d.opening_due,0)<>0;

CREATE FUNCTION accountant_v2_validate_distributor_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a accountant_v2_accounting_accounts; expected text[];
BEGIN
  SELECT * INTO a FROM accountant_v2_accounting_accounts WHERE id=NEW.account_id;
  expected := CASE NEW.role WHEN 'payable' THEN ARRAY['ACCOUNTS_PAYABLE'] WHEN 'stock' THEN ARRAY['STOCK']
    WHEN 'cash' THEN ARRAY['CASH'] WHEN 'tax' THEN ARRAY['OTHER_CURRENT_ASSET']
    WHEN 'opening' THEN ARRAY['EQUITY','OTHER_CURRENT_LIABILITY'] ELSE ARRAY['BANK'] END;
  IF NEW.role NOT IN ('payable','stock','cash','bank','tax','opening') AND NEW.role NOT LIKE 'bank:%' THEN
    RAISE EXCEPTION 'Unknown distributor account role';
  END IF;
  IF a.id IS NULL OR a.company_id<>NEW.company_id OR NOT a.is_active OR a.deleted_at IS NOT NULL
    OR NOT (a.account_type::text=ANY(expected)) THEN RAISE EXCEPTION 'Select an active company account of the correct type for %', NEW.role; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accountant_v2_distributor_mapping_check BEFORE INSERT OR UPDATE ON accountant_v2_distributor_mappings
FOR EACH ROW EXECUTE FUNCTION accountant_v2_validate_distributor_mapping();

CREATE FUNCTION accountant_v2_distributor_check_date(c text, d timestamp, banking boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM accountant_v2_transaction_locks WHERE company_id=c AND deleted_at IS NULL
    AND is_locked AND lock_date>=d AND (module IN ('ALL','ACCOUNTS') OR (banking AND module='BANKING'))) THEN
    RAISE EXCEPTION 'Distributor accounting date % is locked. Unlock the accounting period before changing this transaction.', d;
  END IF;
END $$;

CREATE FUNCTION accountant_v2_sync_distributor(c text, supplier text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE cfg accountant_v2_distributor_settings; e record; prev accountant_v2_distributor_sources;
  sig jsonb; selected jsonb; lines jsonb; l jsonb; jid text; rid text; contact text;
  a text; net numeric; positive numeric; side text; changed integer:=0; cur text;
  oldj accountant_v2_manual_journals; revision integer; banking boolean;
BEGIN
  SELECT * INTO cfg FROM accountant_v2_distributor_settings WHERE company_id=c AND distributor_id=supplier;
  IF NOT FOUND OR NOT cfg.enabled THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('accountant-v2:' || c));
  SELECT currency INTO cur FROM companies WHERE id=c;
  FOR e IN
    SELECT source_key,kind,event_date,amount,tax,mode,bank_id,description,reference
      FROM accountant_v2_distributor_events WHERE company_id=c AND distributor_id=supplier
    UNION ALL
    SELECT s.source_key,'DELETED',NULL,0,0,NULL,NULL,'Deleted source',s.source_key
      FROM accountant_v2_distributor_sources s WHERE s.company_id=c AND s.distributor_id=supplier
      AND s.signature->>'kind'<>'DELETED' AND NOT EXISTS (
        SELECT 1 FROM accountant_v2_distributor_events v WHERE v.company_id=c AND v.distributor_id=supplier AND v.source_key=s.source_key)
    ORDER BY event_date NULLS LAST,source_key
  LOOP
    sig:=to_jsonb(e);
    SELECT * INTO prev FROM accountant_v2_distributor_sources WHERE company_id=c AND distributor_id=supplier AND source_key=e.source_key;
    IF FOUND AND prev.signature=sig THEN CONTINUE; END IF;
    -- Freeze the account mapping on first posting. Default changes affect new sources only.
    selected:=prev.accounts;
    IF selected IS NULL THEN
      SELECT jsonb_object_agg(role,account_id) INTO selected FROM accountant_v2_distributor_mappings WHERE company_id=c AND distributor_id=supplier;
    END IF;
    revision:=COALESCE(prev.revision,0)+1;
    banking:=e.kind IN ('PAYMENT','RECEIPT');
    IF e.kind<>'DELETED' THEN
      IF e.amount::text IN ('NaN','Infinity','-Infinity') OR (e.amount<0 AND e.kind<>'OPENING') OR e.tax<0 OR e.tax>abs(e.amount) THEN
        RAISE EXCEPTION 'Invalid amount or tax in distributor source %', e.source_key;
      END IF;
      PERFORM accountant_v2_distributor_check_date(c,e.event_date,banking);
    END IF;
    IF prev.journal_id IS NOT NULL THEN
      SELECT * INTO oldj FROM accountant_v2_manual_journals WHERE id=prev.journal_id;
      PERFORM accountant_v2_distributor_check_date(c,oldj.journal_date,prev.signature->>'kind' IN ('PAYMENT','RECEIPT'));
      rid:='c'||substr(md5(c||supplier||e.source_key||revision||':reverse'),1,24);
      INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,notes,currency,total,status,
        published_at,is_system_generated,source_type,source_id,reversed_from_id,updated_at,created_by_id)
      VALUES(rid,c,'DIST-R-'||rid,oldj.journal_date,'Reversal: '||oldj.notes,oldj.currency,oldj.total,'PUBLISHED',
        now(),true,'DISTRIBUTOR_REVERSAL',rid,oldj.id,now(),nullif(current_setting('app.accountant_user',true),''));
      INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,party_id,distributor_id,updated_at)
      SELECT 'c'||substr(md5(rid||jl.id),1,24),c,rid,jl.account_id,
        (CASE jl.side WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END)::"AccountantJournalEntrySide",
        jl.amount,'Reversal: '||COALESCE(jl.description,''),jl.party_id,jl.distributor_id,now()
      FROM accountant_v2_manual_journal_lines jl WHERE jl.journal_id=oldj.id;
    END IF;
    jid:=NULL;
    IF e.kind<>'DELETED' AND e.amount<>0 THEN
      positive:=abs(e.amount); net:=positive-e.tax;
      side:=CASE WHEN e.kind IN ('PAYMENT','RETURN') OR (e.kind='OPENING' AND e.amount<0) THEN 'DEBIT' ELSE 'CREDIT' END;
      lines:=jsonb_build_array(jsonb_build_object('account',selected->>'payable','side',side,'amount',positive));
      side:=CASE side WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END;
      IF e.kind IN ('PURCHASE','RETURN') THEN
        IF net>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account',selected->>'stock','side',side,'amount',net)); END IF;
        IF e.tax>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account',selected->>'tax','side',side,'amount',e.tax)); END IF;
      ELSE
        a:=CASE WHEN e.kind='OPENING' THEN selected->>'opening' WHEN e.mode='CASH' THEN selected->>'cash'
          WHEN e.bank_id IS NOT NULL THEN selected->>('bank:'||e.bank_id) ELSE selected->>'bank' END;
        lines:=lines||jsonb_build_array(jsonb_build_object('account',a,'side',side,'amount',positive));
      END IF;
      FOR l IN SELECT value FROM jsonb_array_elements(lines) LOOP
        IF NOT EXISTS(SELECT 1 FROM accountant_v2_accounting_accounts WHERE id=l->>'account' AND company_id=c AND is_active AND deleted_at IS NULL) THEN
          RAISE EXCEPTION 'Configure active payable, stock, tax and cash/bank accounts for distributor % before posting %',supplier,e.source_key;
        END IF;
      END LOOP;
      jid:='c'||substr(md5(c||supplier||e.source_key||revision||':posting'),1,24);
      INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,
        published_at,is_system_generated,source_type,source_id,updated_at,created_by_id)
      VALUES(jid,c,'DIST-'||jid,e.event_date,e.reference,e.kind||': '||e.description,COALESCE(cur,'INR'),positive,'PUBLISHED',
        now(),true,'DISTRIBUTOR',supplier||':'||e.source_key||':'||revision,now(),nullif(current_setting('app.accountant_user',true),''));
      FOR l IN SELECT value FROM jsonb_array_elements(lines) LOOP
        INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,party_id,distributor_id,updated_at)
        VALUES('c'||substr(md5(jid||l::text),1,24),c,jid,l->>'account',(l->>'side')::"AccountantJournalEntrySide",
          (l->>'amount')::numeric,e.reference,cfg.contact_id,supplier,now());
      END LOOP;
    END IF;
    INSERT INTO accountant_v2_distributor_sources(company_id,distributor_id,source_key,signature,accounts,revision,journal_id)
    VALUES(c,supplier,e.source_key,sig,COALESCE(selected,'{}'),revision,jid)
    ON CONFLICT(company_id,distributor_id,source_key) DO UPDATE SET signature=EXCLUDED.signature,revision=EXCLUDED.revision,journal_id=EXCLUDED.journal_id;
    INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
    VALUES('c'||substr(md5(c||supplier||e.source_key||revision||':audit'),1,24),c,
      COALESCE(nullif(current_setting('app.accountant_user',true),''),'distributor-source'),
      CASE WHEN e.kind='DELETED' THEN 'reverse' ELSE 'post' END,'distributor-accounting',supplier||':'||e.source_key,
      jsonb_build_object('revision',revision,'journalId',jid,'previousJournalId',prev.journal_id,'source',sig),now());
    changed:=changed+1;
  END LOOP;
  RETURN changed;
END $$;

-- Deferred triggers see the final purchase/payment/return state and roll back
-- the business write too if journal validation fails. No async dual-write gap.
CREATE FUNCTION accountant_v2_distributor_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' AND OLD.distributor_id IS NOT NULL THEN PERFORM accountant_v2_sync_distributor(OLD.company_id,OLD.distributor_id); END IF;
  IF TG_OP<>'DELETE' AND NEW.distributor_id IS NOT NULL THEN PERFORM accountant_v2_sync_distributor(NEW.company_id,NEW.distributor_id); END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accountant_v2_dist_credit AFTER INSERT OR UPDATE OR DELETE ON distributor_credits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_distributor_changed();
CREATE CONSTRAINT TRIGGER accountant_v2_dist_payment AFTER INSERT OR UPDATE OR DELETE ON distributor_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_distributor_changed();
CREATE CONSTRAINT TRIGGER accountant_v2_dist_purchase AFTER INSERT OR UPDATE OR DELETE ON purchase_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_distributor_changed();
CREATE CONSTRAINT TRIGGER accountant_v2_dist_return AFTER INSERT OR UPDATE OR DELETE ON purchase_returns DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_distributor_changed();
CREATE CONSTRAINT TRIGGER accountant_v2_dist_opening AFTER INSERT OR UPDATE OR DELETE ON distributor_companies DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_distributor_changed();
CREATE FUNCTION accountant_v2_distributor_money_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT company_id,distributor_id FROM distributor_credits WHERE money_transaction_id=COALESCE(NEW.id,OLD.id)
  LOOP PERFORM accountant_v2_sync_distributor(r.company_id,r.distributor_id); END LOOP;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accountant_v2_dist_money AFTER UPDATE ON money_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_distributor_money_changed();

CREATE FUNCTION accountant_v2_protect_distributor_money() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM distributor_credits c JOIN accountant_v2_distributor_settings s
    ON s.company_id=c.company_id AND s.distributor_id=c.distributor_id
    WHERE c.money_transaction_id=OLD.id AND s.enabled) THEN
    RAISE EXCEPTION 'Delete the linked distributor credit to remove this money transaction';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER accountant_v2_dist_money_delete BEFORE DELETE ON money_transactions FOR EACH ROW EXECUTE FUNCTION accountant_v2_protect_distributor_money();
