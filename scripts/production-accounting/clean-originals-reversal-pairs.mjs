import {Pool,types} from 'pg';
import dotenv from 'dotenv';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';

// Authorized data cleanup only. No schema/function/trigger changes or resync.
const company='6980e6e4-7d5d-413c-9554-24f385c9b853';
const opt=k=>process.argv.find(x=>x.startsWith(`--${k}=`))?.slice(k.length+3);
for(const arg of process.argv.slice(2))if(arg!=='--apply'&&!['env-file','output','expected-host','bank-id'].some(k=>arg.startsWith(`--${k}=`)))throw Error('Unknown argument');
if(!opt('env-file')||!opt('output')||!opt('expected-host')||!opt('bank-id'))throw Error('Explicit --env-file, --expected-host, --bank-id and --output are required');
const apply=process.argv.includes('--apply'),env=dotenv.parse(readFileSync(resolve(opt('env-file'))));
assert.ok(env.DATABASE_URL,'Selected environment has no DATABASE_URL');
assert.equal(new URL(env.DATABASE_URL).hostname,opt('expected-host'),'Database endpoint does not match requested target');
types.setTypeParser(1114,v=>v);
const pool=new Pool({connectionString:env.DATABASE_URL,connectionTimeoutMillis:15000}),db=await pool.connect();
const q=async(sql,params=[company])=>(await db.query(sql,params)).rows;
const report={companyId:company,applied:false,startedAt:new Date().toISOString()};
const output=resolve(opt('output'));mkdirSync(output,{recursive:true});
const stem=`${apply?'apply':'preview'}-${new Date().toISOString().replace(/[:.]/g,'-')}`;
const save=(name,data)=>writeFileSync(join(output,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
async function movements(){return q(`SELECT l.account_id,j.journal_date::text posting_date,
 sum(CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END)::text amount
 FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 WHERE j.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL
 GROUP BY l.account_id,j.journal_date
 HAVING sum(CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END)<>0 ORDER BY 1,2`);}
async function schemaFingerprint(){return q(`SELECT md5(coalesce(string_agg(p.proname||pg_get_functiondef(p.oid),'' ORDER BY p.oid),'')) functions
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'accountant_v2_%' AND $1::text IS NOT NULL`);}
async function preserved(ids){
 const result={};
 const tables=await q(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='company_id'
 AND (table_name LIKE 'accountant_v2_%' OR table_name IN ('bills','entries','expenses','purchase_orders','distributor_credits','distributor_payments','purchase_returns','money_transactions','account_transfers','investments','salary_payments','user_ledger_entries','items','variants','account_ledger_entries')) AND $1::text IS NOT NULL ORDER BY table_name`);
 for(const {table_name:t} of tables){
  assert.match(t,/^[a-z0-9_]+$/);
  if(t==='accountant_v2_accountant_audit')continue;
  const condition=t==='accountant_v2_manual_journals'?' AND NOT(id=ANY($2::text[]))':t==='accountant_v2_manual_journal_lines'?' AND NOT(journal_id=ANY($2::text[]))':'';
  result[t]=(await q(`SELECT count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) hash FROM "${t}" t WHERE company_id=$1${condition}`,condition?[company,ids]:[company]))[0];
 }
 return result;
}
try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await db.query('SET LOCAL search_path TO public');
 await db.query("SET LOCAL lock_timeout='15s'");
 const [identity]=await q('SELECT id,name FROM companies WHERE id=$1 FOR UPDATE');assert.equal(identity?.name,'ORIGINALS CLOTHING');
 const [bank]=await q("SELECT id FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND is_primary AND account_type='BANK' AND account_number='50200059119241' AND deleted_at IS NULL");assert.equal(bank?.id,opt('bank-id'),'Wrong database/account');
 await q("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))");
 const pairs=await q(`SELECT r.id reversal_id,o.id original_id,r.source_type reversal_type,
 COALESCE(currentj.id,tr.id,supplierj.id) replacement_id,
 ((s.source_key IS NOT NULL AND s.journal_id IS NULL AND s.signature->'lines'='[]'::jsonb)
  OR (ds.source_key IS NOT NULL AND ds.journal_id IS NULL AND ds.signature->>'kind'='DELETED')) AS withdrawn_source
 FROM accountant_v2_manual_journals r JOIN accountant_v2_manual_journals o ON o.id=r.reversed_from_id AND o.company_id=r.company_id
 LEFT JOIN accountant_v2_erp_sources s ON s.company_id=r.company_id AND s.source_key=CASE
 WHEN r.source_type='ERP_HISTORY_MIGRATION_REVERSAL' THEN lower(split_part(o.reference_number,':',1))||':'||split_part(o.reference_number,':',2)
 WHEN r.source_type='ERP_REVERSAL' THEN regexp_replace(o.source_id,':[0-9]+$','') END
 LEFT JOIN accountant_v2_distributor_sources ds ON ds.company_id=r.company_id AND r.source_type='DISTRIBUTOR_REVERSAL'
  AND ds.distributor_id=split_part(o.source_id,':',1)
  AND ds.source_key=regexp_replace(substring(o.source_id FROM strpos(o.source_id,':')+1),':[0-9]+$','')
 LEFT JOIN accountant_v2_manual_journals supplierj ON supplierj.id=ds.journal_id AND supplierj.company_id=r.company_id AND supplierj.status='PUBLISHED' AND supplierj.deleted_at IS NULL
 LEFT JOIN accountant_v2_manual_journals currentj ON currentj.id=s.journal_id AND currentj.company_id=r.company_id AND currentj.status='PUBLISHED' AND currentj.deleted_at IS NULL
 LEFT JOIN accountant_v2_accountant_audit a ON a.company_id=r.company_id AND a.resource='transfer-history-import' AND a.action='imported' AND a.after->>'reversalId'=r.id
 LEFT JOIN accountant_v2_manual_journals tr ON tr.id=a.after->>'journalId' AND tr.company_id=r.company_id AND tr.status='PUBLISHED' AND tr.deleted_at IS NULL
 WHERE r.company_id=$1 AND r.source_type IN ('ERP_HISTORY_MIGRATION_REVERSAL','TRANSFER_HISTORY_MIGRATION_REVERSAL','ERP_REVERSAL','DISTRIBUTOR_REVERSAL')
 AND r.status='PUBLISHED' AND o.status='PUBLISHED' AND r.deleted_at IS NULL AND o.deleted_at IS NULL
 AND r.journal_date=o.journal_date AND r.currency=o.currency AND r.exchange_rate=o.exchange_rate ORDER BY r.id`);
 report.pairs=pairs.length;report.pairsByType={};
 for(const pair of pairs)report.pairsByType[pair.reversal_type]=(report.pairsByType[pair.reversal_type]||0)+1;
 const ids=pairs.flatMap(p=>[p.original_id,p.reversal_id]),idSet=new Set(ids);
 assert.equal(idSet.size,ids.length,'Overlapping correction pairs');
 for(const pair of pairs)assert.ok((pair.replacement_id&&!idSet.has(pair.replacement_id))||pair.withdrawn_source,'Missing current replacement or verified withdrawn source');
 report.withdrawnSourcePairs=pairs.filter(p=>p.withdrawn_source).length;
 if(!ids.length){await db.query('ROLLBACK');report.verified=true;report.note='No remaining eligible pairs';save(stem+'-report.json',report);console.log(JSON.stringify(report));}
 else{
  const headers=await q('SELECT * FROM accountant_v2_manual_journals WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY id FOR UPDATE',[company,ids]);assert.equal(headers.length,ids.length);
  const lines=await q('SELECT * FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND journal_id=ANY($2::text[]) ORDER BY id FOR UPDATE',[company,ids]);
  const invalid=await q(`SELECT r.id,l.account_id,coalesce(l.party_id,'') contact,coalesce(l.project_id,'') project,
  coalesce(l.distributor_id,'') supplier,coalesce(l.source_parties,'{}'::jsonb) parties
  FROM accountant_v2_manual_journals r JOIN accountant_v2_manual_journal_lines l ON l.journal_id IN(r.id,r.reversed_from_id) AND l.company_id=r.company_id AND l.deleted_at IS NULL
  JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
  WHERE r.company_id=$1 AND r.id=ANY($2::text[])
  GROUP BY r.id,l.account_id,l.party_id,l.project_id,l.distributor_id,coalesce(l.source_parties,'{}'::jsonb)
  HAVING sum(CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END)<>0`,[company,pairs.map(p=>p.reversal_id)]);
  assert.equal(invalid.length,0,'Pair changes an account or party balance');
  const links=await q("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='journal_id' AND table_name<>'accountant_v2_manual_journal_lines' AND $1::text IS NOT NULL");
  for(const {table_name:t} of links){assert.match(t,/^[a-z0-9_]+$/);assert.equal((await q(`SELECT 1 FROM "${t}" WHERE company_id=$1 AND journal_id=ANY($2::text[]) LIMIT 1`,[company,ids])).length,0,`Current source references obsolete pair in ${t}`);}
  assert.equal((await q('SELECT id FROM accountant_v2_manual_journals WHERE reversed_from_id=ANY($1::text[]) AND NOT(id=ANY($1::text[]))',[ids])).length,0,'Another journal references this pair');
  const locked=await q(`SELECT 1 FROM accountant_v2_manual_journals j JOIN accountant_v2_transaction_locks k ON k.company_id=j.company_id AND k.is_locked AND k.deleted_at IS NULL
   AND k.module IN ('ALL','ACCOUNTS','BANKING') AND j.journal_date<=k.lock_date WHERE j.company_id=$1 AND j.id=ANY($2::text[]) LIMIT 1`,[company,ids]);assert.equal(locked.length,0,'Accounting dates are locked');
  const before=await movements(),sources=await preserved(ids),schema=await schemaFingerprint();
  const auditBefore=(await q("SELECT count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) hash FROM accountant_v2_accountant_audit t WHERE company_id=$1"))[0];
  const replacements=await q('SELECT * FROM accountant_v2_manual_journals WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY id',[company,[...new Set(pairs.map(p=>p.replacement_id).filter(Boolean))]]);
  const backup={company:identity,pairs,journals:headers,lines,replacements,movements:before,sourceFingerprints:sources,schemaFingerprint:schema};
  const backupName=stem+'-backup.json';save(backupName,backup);
  report.backup=join(output,backupName);report.backupSha256=createHash('sha256').update(readFileSync(report.backup)).digest('hex');
  const readBack=JSON.parse(readFileSync(report.backup,'utf8'));assert.equal(readBack.journals.length,ids.length);assert.equal(readBack.lines.length,lines.length);
  const removed=await db.query('DELETE FROM accountant_v2_manual_journals WHERE company_id=$1 AND id=ANY($2::text[]) RETURNING id',[company,ids]);assert.equal(removed.rowCount,ids.length);
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  assert.deepEqual(await movements(),before,'Account movements changed');assert.deepEqual(await preserved(ids),sources,'Sources or retained accounting rows changed');assert.deepEqual(await schemaFingerprint(),schema,'Posting functions changed');
  assert.equal((await q('SELECT id FROM accountant_v2_manual_journal_lines WHERE journal_id=ANY($1::text[]) LIMIT 1',[ids])).length,0,'Orphaned lines');
  assert.deepEqual((await q("SELECT count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) hash FROM accountant_v2_accountant_audit t WHERE company_id=$1"))[0],auditBefore);
  report.removedJournalRows=ids.length;report.removedLineRows=lines.length;report.accountsChecked=new Set(before.map(m=>m.account_id)).size;
  report.verifications={accountMovementsUnchanged:true,sourcesAndRetainedPostingsUnchanged:true,replacementsPreserved:true,postingFunctionsUnchanged:true,backupReadBack:true};
  if(apply){
   await db.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
    VALUES($1,$2,'codex-user-authorized','removed-cancelling-pairs','accounting-correction-cleanup',$2,$3::jsonb,now())`,['c'+randomBytes(12).toString('hex'),company,JSON.stringify({...report,pairs})]);
  }
  await db.query(apply?'COMMIT':'ROLLBACK');report.applied=apply;report.verified=true;
  save(stem+'-report.json',report);console.log(JSON.stringify(report));
 }
}catch(error){await db.query('ROLLBACK');report.error=error.message;save(stem+'-failed.json',report);console.error(JSON.stringify(report));process.exitCode=1;}
finally{db.release();await pool.end();}
