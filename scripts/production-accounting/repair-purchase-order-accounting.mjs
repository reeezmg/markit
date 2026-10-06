import 'dotenv/config';
import {Pool,types} from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {installPurchaseOrderAuthority} from './lib/purchase-order-authority.mjs';
types.setTypeParser(1114,value=>value);
const args=process.argv.slice(2),apply=args.includes('--apply');
const arg=name=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
for(const a of args)if(a!=='--apply'&&!['audit','report','backup'].some(k=>a.startsWith(`--${k}=`)))throw Error('Unknown argument '+a);
if(!arg('audit')||!arg('report')||(apply&&!arg('backup')))throw Error('Explicit --audit, --report and (for apply) --backup paths required');
const audit=JSON.parse(readFileSync(arg('audit'),'utf8'));
const codes=new Set(['POSITIVE_PO_WITHOUT_PURCHASE_EVENT','POSITIVE_PO_WITHOUT_SUPPLIER','PURCHASE_HEADER_DIFFERS_FROM_SUPPLIER_CREDITS','SUPPLIER_ONLY_ON_CREDIT_SOURCE']);
const targets=audit.companies.flatMap(c=>[...c.issues,...c.reviews].filter(r=>codes.has(r.code)).map(r=>({companyId:c.companyId,id:r.sourceId})));
const unique=[...new Map(targets.map(t=>[t.companyId+':'+t.id,t])).values()];
const ids=audit.companies.map(c=>c.companyId),pids=unique.map(t=>t.id);
if(!unique.length||ids.some(id=>typeof id!=='string')||pids.some(id=>typeof id!=='string'))throw Error('Invalid source-audit target selection');
const idFor=text=>'c'+createHash('sha256').update(text).digest('hex').slice(0,24);
const report={at:new Date().toISOString(),applied:false,authority:'Approved purchase-order header amounts, tax and supplier; existing credit supplier only when header has no supplier',auditPath:path.resolve(arg('audit')),targetCount:unique.length,companies:[],verification:{}};
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:20000}),db=await pool.connect();
const sourceTables=['purchase_orders','distributor_credits','distributor_payments','purchase_returns','products','variants','items','bills','entries','expenses','account_ledger_entries','money_transactions','investments'];
const hashes=async()=> (await db.query(sourceTables.map(table=>`SELECT '${table}' AS name,count(*)::text rows,md5(COALESCE(string_agg(row_to_json(t)::text,E'\n' ORDER BY id),'')) hash FROM ${table} t WHERE company_id=ANY($1::text[])`).join(' UNION ALL '),[ids])).rows;
const balances=async()=> (await db.query(`SELECT a.id,a.company_id,a.name,a.account_type::text type,COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount*j.exchange_rate ELSE -l.amount*j.exchange_rate END) FILTER(WHERE j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL),0)::numeric(18,2)::text balance FROM accountant_v2_accounting_accounts a LEFT JOIN accountant_v2_manual_journal_lines l ON l.account_id=a.id AND l.company_id=a.company_id LEFT JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id WHERE a.company_id=ANY($1::text[]) GROUP BY a.id ORDER BY a.company_id,a.id`,[ids])).rows;
const stockCheck=async()=> (await db.query(`WITH expected AS(SELECT c.company_id,v->>'account_id' id,round(sum((v->>'value')::numeric),2) value FROM accountant_v2_stock_control c CROSS JOIN LATERAL jsonb_array_elements(accountant_v2_stock_snapshot(c.company_id)) v WHERE c.company_id=ANY($1::text[]) GROUP BY 1,2),posted AS(SELECT l.company_id,l.account_id id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount*j.exchange_rate ELSE -l.amount*j.exchange_rate END) value FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id WHERE l.company_id=ANY($1::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY 1,2) SELECT a.company_id,a.id,a.name,COALESCE(e.value,0)::text source,COALESCE(p.value,0)::numeric(18,2)::text posted,round(COALESCE(p.value,0)-COALESCE(e.value,0),2)::text difference FROM accountant_v2_accounting_accounts a LEFT JOIN expected e ON e.id=a.id LEFT JOIN posted p ON p.id=a.id WHERE a.company_id=ANY($1::text[]) AND a.account_type='STOCK' AND a.deleted_at IS NULL ORDER BY a.id`,[ids])).rows;
const purchaseCheck=async()=> (await db.query(`WITH latest AS(SELECT DISTINCT ON (company_id,"resourceId") company_id,"resourceId" pid,"after" FROM accountant_v2_accountant_audit WHERE company_id=ANY($1::text[]) AND resource='purchase-order-source-state' ORDER BY company_id,"resourceId",("after"->>'revision')::int DESC),active AS(
 SELECT s.company_id,substr(s.source_key,10) pid,s.journal_id,s.distributor_id FROM accountant_v2_distributor_sources s WHERE s.company_id=ANY($1::text[]) AND s.source_key LIKE 'purchase:%' AND s.journal_id IS NOT NULL
 UNION ALL SELECT company_id,pid,"after"->>'journalId',NULL::text FROM latest WHERE "after"->>'journalId' IS NOT NULL),totals AS(
 SELECT x.company_id,x.pid,count(*) journals,sum(j.total) gross,sum(COALESCE(t.tax,0)) tax,array_agg(x.distributor_id) suppliers,array_agg(j.journal_date::text) dates,array_agg(j.id) journal_ids
 FROM active x JOIN accountant_v2_manual_journals j ON j.id=x.journal_id AND j.company_id=x.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL
 LEFT JOIN LATERAL(SELECT sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) tax FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id WHERE l.journal_id=j.id AND l.deleted_at IS NULL AND a.code='1210') t ON true GROUP BY x.company_id,x.pid)
 SELECT p.company_id,p.id,p.purchase_order_no,p.distributor_id,p.created_at::text source_date,round(p.total_amount::numeric,2)::text source_gross,accountant_v2_purchase_tax(p)::text source_tax,
 COALESCE(t.gross,0)::text posted_gross,COALESCE(t.tax,0)::text posted_tax,round(COALESCE(t.gross,0)-round(p.total_amount::numeric,2),2)::text gross_difference,round(COALESCE(t.tax,0)-accountant_v2_purchase_tax(p),2)::text tax_difference,
 COALESCE(t.journals,0)::int journal_count,t.suppliers,t.dates,t.journal_ids,
 COALESCE(p.distributor_id,(SELECT CASE WHEN count(DISTINCT distributor_id)=1 THEN min(distributor_id) END FROM distributor_credits WHERE company_id=p.company_id AND purchase_order_id=p.id)) expected_supplier
 FROM purchase_orders p LEFT JOIN totals t ON t.company_id=p.company_id AND t.pid=p.id WHERE p.company_id=ANY($1::text[]) AND round(p.total_amount::numeric,2)>0 ORDER BY p.company_id,p.purchase_order_no`,[ids])).rows;
try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 await db.query('SET LOCAL search_path TO public');
 await db.query("SET LOCAL lock_timeout='15s'");await db.query("SET LOCAL statement_timeout='180s'");
 await db.query(`LOCK TABLE ${sourceTables.join(',')},accountant_v2_erp_settings,accountant_v2_distributor_settings,accountant_v2_distributor_mappings,accountant_v2_accounting_accounts,accountant_v2_transaction_locks IN SHARE MODE`);
 for(const id of [...ids].sort())await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[id]);
 console.log('Source tables and company accounting locks acquired; capturing baseline');
 const beforeHashes=await hashes(),beforeBalances=await balances(),beforeStock=await stockCheck();
 if(beforeStock.some(r=>Number(r.difference)!==0))throw Error('Existing stock does not reconcile; no changes applied');
 // A matching total can still belong to the wrong supplier. Include source-header
 // attribution differences discovered during the same requested purchase repair.
 const attribution=(await db.query(`SELECT DISTINCT p.company_id,p.id,p.purchase_order_no,p.distributor_id source_supplier,s.distributor_id posted_supplier
 FROM purchase_orders p JOIN accountant_v2_distributor_sources s ON s.company_id=p.company_id AND s.source_key='purchase:'||p.id AND s.journal_id IS NOT NULL
 WHERE p.company_id=ANY($1::text[]) AND round(p.total_amount::numeric,2)>0 AND p.distributor_id IS NOT NULL AND s.distributor_id<>p.distributor_id`,[ids])).rows;
 report.additionalSupplierLinkRepairs=attribution.filter(p=>!unique.some(t=>t.companyId===p.company_id&&t.id===p.id));
 for(const p of report.additionalSupplierLinkRepairs){unique.push({companyId:p.company_id,id:p.id});pids.push(p.id);}
 report.targetCount=unique.length;
 const po=(await db.query('SELECT * FROM purchase_orders WHERE id=ANY($1::text[]) ORDER BY company_id,id',[pids])).rows;
 if(po.length!==unique.length||po.some(p=>!unique.some(t=>t.id===p.id&&t.companyId===p.company_id)))throw Error('Target source missing or tenant changed');
 const erp=(await db.query('SELECT * FROM accountant_v2_erp_settings WHERE company_id=ANY($1::text[])',[ids])).rows;
 const ap=(await db.query("SELECT id,company_id FROM accountant_v2_accounting_accounts WHERE company_id=ANY($1::text[]) AND code='2100' AND account_type='ACCOUNTS_PAYABLE' AND is_active AND deleted_at IS NULL",[ids])).rows;
 const beforeView=(await db.query("SELECT pg_get_viewdef('accountant_v2_distributor_events'::regclass,true) definition")).rows[0].definition;
 if(apply){
   const backup={at:new Date().toISOString(),sourceHashes:beforeHashes,balances:beforeBalances,stock:beforeStock,viewDefinition:beforeView,tables:{},functions:{},triggers:[]};
   const backupTables=['purchase_orders','distributor_credits','distributor_payments','purchase_returns','accountant_v2_distributor_sources','accountant_v2_distributor_settings','accountant_v2_distributor_mappings','accountant_v2_stock_control','accountant_v2_erp_settings'];
   for(const table of backupTables)backup.tables[table]=(await db.query(`SELECT * FROM ${table} WHERE company_id=ANY($1::text[])`,[ids])).rows;
   backup.tables.accountant_v2_manual_journals=(await db.query("SELECT * FROM accountant_v2_manual_journals WHERE company_id=ANY($1::text[]) AND source_type IN ('DISTRIBUTOR','DISTRIBUTOR_REVERSAL','STOCK_CONTROL','PURCHASE_ORDER_SOURCE','PURCHASE_ORDER_SOURCE_REVERSAL')",[ids])).rows;
   backup.tables.accountant_v2_manual_journal_lines=(await db.query('SELECT l.* FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id WHERE l.company_id=ANY($1::text[]) AND j.id=ANY($2::text[])',[ids,backup.tables.accountant_v2_manual_journals.map(j=>j.id)])).rows;
   backup.tables.accountant_v2_accountant_audit=(await db.query("SELECT * FROM accountant_v2_accountant_audit WHERE company_id=ANY($1::text[]) AND resource IN ('purchase-order-header-authority','purchase-order-source-state','stock-control','distributor-accounting')",[ids])).rows;
   backup.functions=(await db.query("SELECT p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('accountant_v2_sync_unassigned_purchase','accountant_v2_purchase_authority_changed')")).rows;
   backup.triggers=(await db.query("SELECT tgname,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgname IN ('accountant_v2_dist_po_authority','accountant_v2_dist_credit_po_authority')")).rows;
   writeFileSync(arg('backup'),JSON.stringify(backup,null,2),{flag:'wx'});
   report.backupPath=path.resolve(arg('backup'));report.backupSha256=createHash('sha256').update(readFileSync(arg('backup'))).digest('hex');
 }
 await installPurchaseOrderAuthority(db);
 const approvals=[];
 for(const p of po){
   const cfg=erp.find(s=>s.company_id===p.company_id),payable=ap.find(a=>a.company_id===p.company_id);
   if(!cfg?.enabled||!payable||!cfg.accounts.stock||!cfg.accounts.inputTax)throw Error('Missing company purchase mappings '+p.company_id);
   approvals.push({id:idFor(p.company_id+':po-header-authority:'+p.id),companyId:p.company_id,pid:p.id,after:{authority:'purchase_order_header',sourceAudit:path.basename(arg('audit')),accounts:{payable:payable.id,stock:cfg.accounts.stock,tax:cfg.accounts.inputTax},sourceHeader:p}});
 }
 await db.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
 SELECT x->>'id',x->>'companyId','authorized-production-repair','authorize','purchase-order-header-authority',x->>'pid',x->'after',now()
 FROM jsonb_array_elements($1::jsonb) x ON CONFLICT(id) DO NOTHING`,[JSON.stringify(approvals)]);
 console.log('Purchase authority prepared for '+approvals.length+' source records');
 for(const company of audit.companies){
   const c=company.companyId;
   await db.query("SELECT set_config('app.stock_sync',$1,true)",[c]);
   const changed=Number((await db.query('SELECT COALESCE(sum(accountant_v2_sync_distributor(company_id,distributor_id)),0)::int n FROM accountant_v2_distributor_settings WHERE company_id=$1 AND enabled',[c])).rows[0].n);
   const anonymous=Number((await db.query("SELECT COALESCE(sum(accountant_v2_sync_unassigned_purchase(company_id,\"resourceId\")),0)::int n FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='purchase-order-header-authority'",[c])).rows[0].n);
   await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
   await db.query("SELECT set_config('app.stock_sync','',true)");
   const stock=Number((await db.query('SELECT accountant_v2_sync_stock($1) n',[c])).rows[0].n);
   report.companies.push({company:company.company,companyId:c,changedSupplierSources:changed,changedUnassignedSources:anonymous,stockAdjustmentJournals:stock});
   console.log(company.company+': supplier sources '+changed+', unassigned purchases '+anonymous);
 }
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
 const purchases=await purchaseCheck(),afterStock=await stockCheck(),afterHashes=await hashes(),afterBalances=await balances();
 const badPurchase=purchases.filter(p=>Number(p.gross_difference)!==0||Number(p.tax_difference)!==0||p.journal_count!==1||p.suppliers?.[0]!==p.expected_supplier);
 const targetDateErrors=purchases.filter(p=>pids.includes(p.id)&&p.dates?.[0]!==p.source_date);
 const fundingChanges=afterBalances.filter(a=>['CASH','BANK'].includes(a.type)&&a.balance!==beforeBalances.find(b=>b.id===a.id)?.balance);
 const unbalanced=(await db.query(`SELECT j.id FROM accountant_v2_manual_journals j LEFT JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL WHERE j.company_id=ANY($1::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL GROUP BY j.id HAVING COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),1)<>0 OR sum(l.amount) FILTER(WHERE l.side='DEBIT') IS DISTINCT FROM j.total`,[ids])).rows;
 const supplierBalances=(await db.query(`SELECT cfg.company_id,cfg.distributor_id,COALESCE((SELECT sum(CASE WHEN e.kind IN ('PAYMENT','RETURN') THEN -e.amount ELSE e.amount END) FROM accountant_v2_distributor_events e WHERE e.company_id=cfg.company_id AND e.distributor_id=cfg.distributor_id),0)::numeric(18,2)::text expected,COALESCE((SELECT sum(CASE l.side WHEN 'CREDIT' THEN l.amount ELSE -l.amount END) FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id WHERE l.company_id=cfg.company_id AND l.distributor_id=cfg.distributor_id AND a.account_type='ACCOUNTS_PAYABLE' AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL),0)::numeric(18,2)::text posted FROM accountant_v2_distributor_settings cfg WHERE cfg.company_id=ANY($1::text[]) AND cfg.enabled ORDER BY cfg.company_id,cfg.distributor_id`,[ids])).rows;
 const repeat=(await db.query('SELECT COALESCE(sum(accountant_v2_sync_distributor(company_id,distributor_id)),0)::int n FROM accountant_v2_distributor_settings WHERE company_id=ANY($1::text[]) AND enabled',[ids])).rows[0].n;
 const repeatUnassigned=(await db.query("SELECT COALESCE(sum(accountant_v2_sync_unassigned_purchase(company_id,\"resourceId\")),0)::int n FROM accountant_v2_accountant_audit WHERE company_id=ANY($1::text[]) AND resource='purchase-order-header-authority'",[ids])).rows[0].n;
 const repeatStock=(await db.query('SELECT COALESCE(sum(accountant_v2_sync_stock(company_id)),0)::int n FROM accountant_v2_stock_control WHERE company_id=ANY($1::text[]) AND enabled',[ids])).rows[0].n;
 report.purchases=purchases;report.supplierBalances=supplierBalances;report.stock=afterStock;report.balancesBefore=beforeBalances;report.balancesAfter=afterBalances;
 report.sourceHashesBefore=beforeHashes;report.sourceHashesAfter=afterHashes;
 report.verification={positivePurchaseOrders:purchases.length,purchaseDifferences:badPurchase,dateDifferences:targetDateErrors,stockDifferences:afterStock.filter(s=>Number(s.difference)!==0),fundingChanges,unbalancedJournals:unbalanced,supplierDifferences:supplierBalances.filter(s=>s.expected!==s.posted),sourceRowsUnchanged:JSON.stringify(beforeHashes)===JSON.stringify(afterHashes),repeatSupplierChanges:repeat,repeatUnassignedChanges:repeatUnassigned,repeatStockChanges:repeatStock};
 if(badPurchase.length||targetDateErrors.length||report.verification.stockDifferences.length||fundingChanges.length||unbalanced.length||report.verification.supplierDifferences.length||!report.verification.sourceRowsUnchanged||repeat||repeatUnassigned||repeatStock)throw Error('Purchase repair verification failed; entire transaction rolled back');
 if(apply){await db.query('COMMIT');report.applied=true;}else await db.query('ROLLBACK');
 writeFileSync(arg('report'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({applied:report.applied,targetCount:report.targetCount,verification:report.verification},null,2));
}catch(error){await db.query('ROLLBACK');report.error=error.message;writeFileSync(arg('report'),JSON.stringify(report,null,2));throw error;}
finally{db.release();await pool.end();}
