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
