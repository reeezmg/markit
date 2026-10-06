-- Current-cost inventory control. Disabled until the explicit opening reconciliation.
CREATE TABLE accountant_v2_stock_control (
 company_id text PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
 stock_account_id text NOT NULL,
 opening_account_id text NOT NULL,
 adjustment_account_id text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 initialized_at timestamp(3),
 revision integer NOT NULL DEFAULT 0,
 source_snapshot jsonb NOT NULL DEFAULT '[]',
 updated_at timestamp(3) NOT NULL DEFAULT now()
);

CREATE FUNCTION accountant_v2_stock_snapshot(c text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.product_id),'[]') FROM (
 SELECT p.id product_id,p.name product_name,p.purchaseorder_id purchase_order_id,
 COALESCE((SELECT s.accounts->>'stock' FROM accountant_v2_distributor_sources s
   WHERE s.company_id=c AND s.source_key='purchase:'||p.purchaseorder_id AND s.journal_id IS NOT NULL
   ORDER BY s.distributor_id LIMIT 1),cfg.stock_account_id) account_id,
 COALESCE(sum(COALESCE(i.qty,0)::numeric*COALESCE(v.p_price,0)::numeric),0) value,
 COALESCE(jsonb_agg(jsonb_build_object('itemId',i.id,'variantId',v.id,'quantity',COALESCE(i.qty,0),'unitCost',COALESCE(v.p_price,0)) ORDER BY i.id) FILTER(WHERE i.id IS NOT NULL),'[]') items
 FROM products p JOIN accountant_v2_stock_control cfg ON cfg.company_id=p.company_id
 LEFT JOIN variants v ON v.product_id=p.id AND v.company_id=p.company_id
 LEFT JOIN items i ON i.variant_id=v.id AND i.company_id=p.company_id
 WHERE p.company_id=c GROUP BY p.id,p.name,p.purchaseorder_id,cfg.stock_account_id
 ) x
$$;

CREATE FUNCTION accountant_v2_sync_stock(c text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE cfg accountant_v2_stock_control; snapshot jsonb; old_guard text;
 constraints_list text; a record; target numeric; posted numeric; delta numeric;
 offset_id text; jid text; rev integer; changed integer:=0; label text;
BEGIN
 IF current_setting('app.stock_sync',true)=c THEN RETURN 0; END IF;
 IF NOT EXISTS(SELECT 1 FROM accountant_v2_stock_control WHERE company_id=c AND enabled) THEN RETURN 0; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('accountant-v2:'||c));
 SELECT * INTO cfg FROM accountant_v2_stock_control WHERE company_id=c FOR UPDATE;
 old_guard:=current_setting('app.stock_sync',true);
 PERFORM set_config('app.stock_sync',c,true);
 -- Flush native postings before measuring their stock effect. Only accounting-source
 -- constraints are flushed, not unrelated application or stock-control constraints.
 SELECT string_agg(quote_ident(tgname),',') INTO constraints_list FROM pg_trigger
 WHERE tgdeferrable AND NOT tgisinternal AND tgrelid IN (
 SELECT oid FROM pg_class WHERE relnamespace=current_schema()::regnamespace)
 AND (tgname LIKE 'accountant_v2_dist_%' OR tgname LIKE 'accountant_v2_erp_%');
 IF constraints_list IS NOT NULL THEN EXECUTE 'SET CONSTRAINTS '||constraints_list||' IMMEDIATE'; END IF;
 IF EXISTS(SELECT 1 FROM variants WHERE company_id=c AND (p_price<0 OR p_price::text IN ('NaN','Infinity','-Infinity'))) THEN
   RAISE EXCEPTION 'Stock purchase prices must be finite and nonnegative';
 END IF;
 snapshot:=accountant_v2_stock_snapshot(c);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot) v WHERE NOT EXISTS(
   SELECT 1 FROM accountant_v2_accounting_accounts acct WHERE acct.id=v->>'account_id' AND acct.company_id=c AND acct.account_type='STOCK' AND acct.is_active AND acct.deleted_at IS NULL)) THEN
   RAISE EXCEPTION 'Every inventory source requires an active company Stock account';
 END IF;
 offset_id:=CASE WHEN cfg.initialized_at IS NULL THEN cfg.opening_account_id ELSE cfg.adjustment_account_id END;
 IF NOT EXISTS(SELECT 1 FROM accountant_v2_accounting_accounts WHERE company_id=c AND id=offset_id AND is_active AND deleted_at IS NULL
   AND account_type::text=CASE WHEN cfg.initialized_at IS NULL THEN 'EQUITY' ELSE 'EXPENSE' END) THEN
   RAISE EXCEPTION 'Configure an active opening inventory / inventory adjustment account';
 END IF;
 rev:=cfg.revision;
 FOR a IN SELECT id,name FROM accountant_v2_accounting_accounts WHERE company_id=c AND account_type='STOCK' AND deleted_at IS NULL ORDER BY id LOOP
   SELECT round(COALESCE(sum((v->>'value')::numeric),0),2) INTO target FROM jsonb_array_elements(snapshot) v WHERE v->>'account_id'=a.id;
   SELECT round(COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount*j.exchange_rate ELSE -l.amount*j.exchange_rate END),0),2) INTO posted
   FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
   WHERE l.company_id=c AND l.account_id=a.id AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL;
   delta:=target-posted;
   IF delta=0 THEN CONTINUE; END IF;
   IF NOT EXISTS(SELECT 1 FROM accountant_v2_accounting_accounts WHERE id=a.id AND is_active) THEN RAISE EXCEPTION 'Stock account % is inactive',a.name; END IF;
   PERFORM accountant_v2_distributor_check_date(c,localtimestamp,false);
   rev:=rev+1;
   jid:='c'||substr(md5(c||':stock-control:'||rev),1,24);
   label:=CASE WHEN cfg.initialized_at IS NULL THEN 'Opening inventory reconciliation' ELSE 'Inventory quantity / cost adjustment' END;
   INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,updated_at)
   VALUES(jid,c,'STK-'||rev,localtimestamp,'STOCK-'||rev,label||': source '||target||', already posted '||posted,
    COALESCE((SELECT currency FROM companies WHERE id=c),'INR'),abs(delta),'PUBLISHED',now(),true,'STOCK_CONTROL',c||':'||rev,now());
   INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,updated_at) VALUES
    ('c'||substr(md5(jid||':stock'),1,24),c,jid,a.id,(CASE WHEN delta>0 THEN 'DEBIT' ELSE 'CREDIT' END)::"AccountantJournalEntrySide",abs(delta),label,now()),
    ('c'||substr(md5(jid||':offset'),1,24),c,jid,offset_id,(CASE WHEN delta>0 THEN 'CREDIT' ELSE 'DEBIT' END)::"AccountantJournalEntrySide",abs(delta),label,now());
   INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
   VALUES('c'||substr(md5(jid||':audit'),1,24),c,COALESCE(nullif(current_setting('app.accountant_user',true),''),'stock-control'),
    'reconcile','stock-control',jid,jsonb_build_object('valuation','remaining quantity * current variant purchase price','accountId',a.id,
    'sourceValue',target,'previousLedgerValue',posted,'adjustment',delta,'opening',cfg.initialized_at IS NULL,'products',snapshot,'previousProducts',cfg.source_snapshot),now());
   changed:=changed+1;
 END LOOP;
 -- PO IDs and item/cost evidence remain available even when a native PO entry meant
 -- no additional stock journal was necessary.
 IF snapshot IS DISTINCT FROM cfg.source_snapshot OR cfg.initialized_at IS NULL OR changed>0 THEN
   UPDATE accountant_v2_stock_control SET source_snapshot=snapshot,initialized_at=COALESCE(initialized_at,now()),revision=rev,updated_at=now() WHERE company_id=c;
 END IF;
 IF constraints_list IS NOT NULL THEN EXECUTE 'SET CONSTRAINTS '||constraints_list||' DEFERRED'; END IF;
 PERFORM set_config('app.stock_sync',COALESCE(old_guard,''),true);
 RETURN changed;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.stock_sync',COALESCE(old_guard,''),true);
 RAISE;
END $$;

CREATE FUNCTION accountant_v2_stock_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_c text; new_c text;
BEGIN
 IF TG_OP<>'INSERT' THEN old_c:=OLD.company_id; END IF;
 IF TG_OP<>'DELETE' THEN new_c:=NEW.company_id; END IF;
 -- Journal updates include publish/unpublish and soft deletion. The synchronizer
 -- sees final transaction state, so native PO/ERP stock is never added twice.
 IF TG_TABLE_NAME='accountant_v2_manual_journal_lines' THEN
   IF NOT EXISTS(SELECT 1 FROM accountant_v2_accounting_accounts WHERE id IN (
      CASE WHEN TG_OP<>'INSERT' THEN OLD.account_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.account_id END) AND account_type='STOCK') THEN RETURN NULL; END IF;
   IF EXISTS(SELECT 1 FROM accountant_v2_manual_journals WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.journal_id ELSE NEW.journal_id END AND source_type='STOCK_CONTROL') THEN RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='accountant_v2_manual_journals' THEN
   IF COALESCE(CASE WHEN TG_OP='DELETE' THEN OLD.source_type ELSE NEW.source_type END,'')='STOCK_CONTROL' THEN RETURN NULL; END IF;
 END IF;
 IF old_c IS NOT NULL THEN PERFORM accountant_v2_sync_stock(old_c); END IF;
 IF new_c IS NOT NULL AND new_c IS DISTINCT FROM old_c THEN PERFORM accountant_v2_sync_stock(new_c); END IF;
 RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER accountant_v2_stock_item AFTER INSERT OR UPDATE OR DELETE ON items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_stock_changed();
CREATE CONSTRAINT TRIGGER accountant_v2_stock_variant AFTER INSERT OR UPDATE OR DELETE ON variants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_stock_changed();
CREATE CONSTRAINT TRIGGER accountant_v2_stock_product AFTER INSERT OR UPDATE OR DELETE ON products DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_stock_changed();
CREATE CONSTRAINT TRIGGER accountant_v2_stock_line AFTER INSERT OR UPDATE OR DELETE ON accountant_v2_manual_journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_stock_changed();
CREATE CONSTRAINT TRIGGER accountant_v2_stock_journal AFTER INSERT OR UPDATE OR DELETE ON accountant_v2_manual_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_stock_changed();
