-- Only explicitly approved purchase IDs use header authority. Unapproved sources
-- retain the installed projection, including authorized payment exclusions.
CREATE OR REPLACE VIEW accountant_v2_distributor_events AS
SELECT e.* FROM accountant_v2_distributor_events_before_po_authority e
WHERE NOT (e.kind='PURCHASE' AND EXISTS (
 SELECT 1 FROM accountant_v2_accountant_audit a
 WHERE a.company_id=e.company_id AND a.resource='purchase-order-header-authority'
 AND 'purchase:'||a."resourceId"=e.source_key))
UNION ALL
SELECT p.company_id,COALESCE(p.distributor_id,s.supplier),'purchase:'||p.id,'PURCHASE',p.created_at,
 round(p.total_amount::numeric,2),accountant_v2_purchase_tax(p),NULL::text,NULL::text,
 'Purchase order source (authorized header authority)',COALESCE(p.bill_no,'PO-'||p.purchase_order_no::text,p.id)
FROM purchase_orders p
LEFT JOIN LATERAL (
 SELECT CASE WHEN count(DISTINCT c.distributor_id)=1 THEN min(c.distributor_id) END supplier
 FROM distributor_credits c WHERE c.company_id=p.company_id AND c.purchase_order_id=p.id
) s ON true
WHERE round(p.total_amount::numeric,2)>0 AND COALESCE(p.distributor_id,s.supplier) IS NOT NULL
AND EXISTS (SELECT 1 FROM accountant_v2_accountant_audit a WHERE a.company_id=p.company_id
 AND a.resource='purchase-order-header-authority' AND a."resourceId"=p.id);

-- Sources without any supplier are posted to the company's existing payable
-- account with null supplier/contact IDs. No vendor, payment or quantity is invented.
CREATE OR REPLACE FUNCTION accountant_v2_sync_unassigned_purchase(c text,pid text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE p purchase_orders; approval jsonb; prev jsonb; sig jsonb; cfg jsonb; cur text;
 gross numeric; tax numeric; net numeric; rev integer; jid text; rid text; oldj accountant_v2_manual_journals;
 reference text; l jsonb; lines jsonb; unassigned boolean; source_exists boolean;
BEGIN
 SELECT a."after" INTO approval FROM accountant_v2_accountant_audit a
 WHERE a.company_id=c AND a.resource='purchase-order-header-authority' AND a."resourceId"=pid LIMIT 1;
 IF NOT FOUND THEN RETURN 0; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('accountant-v2:'||c));
 SELECT a."after" INTO prev FROM accountant_v2_accountant_audit a
 WHERE a.company_id=c AND a.resource='purchase-order-source-state' AND a."resourceId"=pid
 ORDER BY (a."after"->>'revision')::integer DESC LIMIT 1;
 SELECT * INTO p FROM purchase_orders WHERE company_id=c AND id=pid;
 source_exists:=FOUND;
 SELECT currency INTO cur FROM companies WHERE id=c;
 unassigned:=source_exists AND p.distributor_id IS NULL AND NOT EXISTS (
   SELECT 1 FROM distributor_credits WHERE company_id=c AND purchase_order_id=pid);
 IF unassigned THEN
   gross:=round(p.total_amount::numeric,2); tax:=accountant_v2_purchase_tax(p);
   IF gross::text IN ('NaN','Infinity','-Infinity') OR gross<0 OR tax<0 OR tax>gross THEN RAISE EXCEPTION 'Invalid purchase amount/tax %',pid; END IF;
   reference:=COALESCE(p.bill_no,'PO-'||p.purchase_order_no::text,pid);
   sig:=jsonb_build_object('kind','PURCHASE','gross',gross,'tax',tax,'date',p.created_at,'reference',reference,'currency',cur);
 ELSE sig:=jsonb_build_object('kind','DELETED'); END IF;
 IF prev->'signature'=sig THEN RETURN 0; END IF;
 IF NOT unassigned AND prev IS NULL THEN RETURN 0; END IF;
 cfg:=COALESCE(prev->'accounts',approval->'accounts');
 rev:=COALESCE((prev->>'revision')::integer,0)+1;
 IF prev->>'journalId' IS NOT NULL THEN
   SELECT * INTO oldj FROM accountant_v2_manual_journals WHERE company_id=c AND id=prev->>'journalId';
   IF NOT FOUND THEN RAISE EXCEPTION 'Missing previous source journal %',pid; END IF;
   PERFORM accountant_v2_distributor_check_date(c,oldj.journal_date,false);
   rid:='c'||substr(md5(c||pid||rev||':source-po-reversal'),1,24);
   INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,notes,currency,total,status,published_at,
      is_system_generated,source_type,source_id,reversed_from_id,updated_at)
   VALUES(rid,c,'PO-R-'||rid,oldj.journal_date,'Reversal: '||oldj.notes,oldj.currency,oldj.total,'PUBLISHED',now(),
      true,'PURCHASE_ORDER_SOURCE_REVERSAL',pid||':'||rev,oldj.id,now());
   INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,source_parties,updated_at)
   SELECT 'c'||substr(md5(rid||jl.id),1,24),c,rid,jl.account_id,
      (CASE jl.side WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END)::"AccountantJournalEntrySide",
      jl.amount,'Reversal: '||COALESCE(jl.description,''),jl.source_parties,now()
   FROM accountant_v2_manual_journal_lines jl WHERE jl.company_id=c AND jl.journal_id=oldj.id AND jl.deleted_at IS NULL;
 END IF;
 jid:=NULL;
 IF unassigned AND gross>0 THEN
   PERFORM accountant_v2_distributor_check_date(c,p.created_at,false);
   FOR l IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('id',cfg->>'payable','type','ACCOUNTS_PAYABLE'),
      jsonb_build_object('id',cfg->>'stock','type','STOCK'),
      jsonb_build_object('id',cfg->>'tax','type','OTHER_CURRENT_ASSET'))) LOOP
     IF NOT EXISTS(SELECT 1 FROM accountant_v2_accounting_accounts a WHERE a.company_id=c AND a.id=l->>'id'
       AND a.account_type::text=l->>'type' AND a.is_active AND a.deleted_at IS NULL AND a.currency=cur)
       THEN RAISE EXCEPTION 'Invalid purchase mapping % %',pid,l; END IF;
   END LOOP;
   net:=gross-tax;
   lines:=jsonb_build_array(jsonb_build_object('account',cfg->>'payable','side','CREDIT','amount',gross));
   IF net>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account',cfg->>'stock','side','DEBIT','amount',net)); END IF;
   IF tax>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account',cfg->>'tax','side','DEBIT','amount',tax)); END IF;
   jid:='c'||substr(md5(c||pid||rev||':source-po-post'),1,24);
   INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,
      published_at,is_system_generated,source_type,source_id,updated_at)
   VALUES(jid,c,'PO-'||jid,p.created_at,reference,'Purchase order #'||COALESCE(p.purchase_order_no::text,pid)||
      ': source supplier not recorded',cur,gross,'PUBLISHED',now(),true,'PURCHASE_ORDER_SOURCE',pid||':'||rev,now());
   FOR l IN SELECT value FROM jsonb_array_elements(lines) LOOP
     INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,source_parties,updated_at)
     VALUES('c'||substr(md5(jid||l::text),1,24),c,jid,l->>'account',(l->>'side')::"AccountantJournalEntrySide",
       (l->>'amount')::numeric,reference,jsonb_build_object('purchaseOrderId',pid,'purchaseOrderNumber',p.purchase_order_no,'supplierMissing',true),now());
   END LOOP;
 END IF;
 INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
 VALUES('c'||substr(md5(c||pid||rev||':source-po-state'),1,24),c,'authorized-production-repair','post','purchase-order-source-state',pid,
   jsonb_build_object('revision',rev,'journalId',jid,'previousJournalId',prev->>'journalId','signature',sig,'accounts',cfg),now());
 RETURN 1;
END $$;

-- Keep approved headers authoritative after source edits, supplier assignment,
-- credit changes and deletion. Unapproved sources retain normal behavior.
CREATE OR REPLACE FUNCTION accountant_v2_purchase_authority_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c text; pid text; r record; old_c text; old_pid text;
BEGIN
 IF TG_OP<>'DELETE' THEN
   c:=NEW.company_id;
   IF TG_TABLE_NAME='purchase_orders' THEN pid:=NEW.id; ELSE pid:=NEW.purchase_order_id; END IF;
 END IF;
 IF TG_OP<>'INSERT' THEN
   old_c:=OLD.company_id;
   IF TG_TABLE_NAME='purchase_orders' THEN old_pid:=OLD.id; ELSE old_pid:=OLD.purchase_order_id; END IF;
 END IF;
 FOR r IN SELECT DISTINCT x.company_id,x.pid FROM (VALUES(c,pid),(old_c,old_pid)) x(company_id,pid)
 WHERE x.pid IS NOT NULL AND EXISTS(SELECT 1 FROM accountant_v2_accountant_audit a WHERE a.company_id=x.company_id
   AND a.resource='purchase-order-header-authority' AND a."resourceId"=x.pid)
 LOOP
   IF EXISTS(SELECT 1 FROM purchase_orders p WHERE p.company_id=r.company_id AND p.id=r.pid
     AND (p.total_amount::text IN ('NaN','Infinity','-Infinity') OR round(p.total_amount::numeric,2)<0
       OR accountant_v2_purchase_tax(p)<0 OR accountant_v2_purchase_tax(p)>round(p.total_amount::numeric,2))) THEN
     RAISE EXCEPTION 'Invalid authorized purchase amount/tax %',r.pid;
   END IF;
   PERFORM accountant_v2_sync_distributor(s.company_id,s.distributor_id) FROM accountant_v2_distributor_settings s
     WHERE s.company_id=r.company_id AND s.enabled;
   PERFORM accountant_v2_sync_unassigned_purchase(r.company_id,r.pid);
 END LOOP;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS accountant_v2_dist_po_authority ON purchase_orders;
CREATE CONSTRAINT TRIGGER accountant_v2_dist_po_authority AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_purchase_authority_changed();
DROP TRIGGER IF EXISTS accountant_v2_dist_credit_po_authority ON distributor_credits;
CREATE CONSTRAINT TRIGGER accountant_v2_dist_credit_po_authority AFTER INSERT OR UPDATE OR DELETE ON distributor_credits
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_purchase_authority_changed();
