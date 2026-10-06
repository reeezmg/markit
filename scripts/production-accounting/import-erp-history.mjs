import 'dotenv/config';
import {Pool} from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';

const args=process.argv.slice(2),apply=args.includes('--apply');
const value=k=>args.find(a=>a.startsWith(`--${k}=`))?.slice(k.length+3);
const requested=args.filter(a=>a.startsWith('--company=')).map(a=>a.slice(10));
for(const arg of args)if(!['--apply','--all-connected'].includes(arg)&&!['company','through','report','defer-source'].some(k=>arg.startsWith(`--${k}=`)))throw Error(`Unknown option ${arg}`);
if(Boolean(requested.length)===args.includes('--all-connected'))throw Error('Choose --company=<id> or --all-connected');
const through=value('through');
if(!through||!/^\d{4}-\d{2}-\d{2}$/.test(through)||new Date(through).toISOString().slice(0,10)!==through)throw Error('Explicit --through=YYYY-MM-DD is required');
const cutoff=through+' 23:59:59.999';
const deferred=args.filter(a=>a.startsWith('--defer-source=')).map(a=>a.slice(15));
if(deferred.length && (requested.length!==1 || deferred.some(s=>!(/^(BILL|EXPENSE):[^:]+$/.test(s)))))throw Error('Deferred source IDs require exactly one explicit company');
const report={applied:false,through:cutoff,deferredSources:deferred,companies:[],errors:[]};
const file=value('report')||`erp-history-${apply?'import':'preview'}.json`;
const pool=new Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect();
const balances=async id=>(await db.query(`SELECT a.id,a.name,a.account_type,sum(CASE l.side WHEN 'DEBIT' THEN l.amount*j.exchange_rate ELSE -l.amount*j.exchange_rate END)::numeric(24,2)::text balance
 FROM accountant_v2_accounting_accounts a JOIN accountant_v2_manual_journal_lines l ON l.account_id=a.id AND l.company_id=a.company_id
 JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 WHERE a.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL AND j.journal_date<=$2::timestamp GROUP BY a.id,a.name,a.account_type ORDER BY a.id`,[id,cutoff])).rows;
try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw Error('Invalid schema');
 await db.query(`SET LOCAL search_path TO "${schema}"`);await db.query("SET LOCAL lock_timeout='15s'");
 if(apply)await db.query('LOCK TABLE bills,entries,expenses,distributor_payments,variants,account_ledger_entries IN SHARE MODE');
 const companies=(await db.query(`SELECT c.id,c.name FROM companies c JOIN accountant_v2_erp_settings s ON s.company_id=c.id AND s.enabled WHERE ($1::boolean OR c.id=ANY($2::text[])) ORDER BY c.id`,[args.includes('--all-connected'),requested])).rows;
 if(!companies.length||requested.some(id=>!companies.some(c=>c.id===id)))throw Error('Select enabled ERP companies');
 await db.query(readFileSync(new URL('./lib/import-erp-history.sql',import.meta.url),'utf8'));
 for(const c of companies){
  await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[c.id]);
  const before=await balances(c.id);
  const rows=(await db.query(`SELECT pg_temp.import_erp_history_source(company_id,kind,id) result FROM (
    SELECT company_id,'BILL' kind,id,created_at FROM bills WHERE company_id=$1 AND created_at<=$2::timestamp
    UNION ALL SELECT company_id,'EXPENSE',id,created_at FROM expenses WHERE company_id=$1 AND created_at<=$2::timestamp
   ) docs WHERE NOT(kind||':'||id=ANY($3::text[])) ORDER BY kind,id`,[c.id,cutoff,deferred])).rows.map(r=>r.result);
  const errors=rows.filter(r=>r.error);
  const summary={company:c.name,companyId:c.id,documents:rows.length,changed:rows.reduce((n,r)=>n+(r.changed||0),0),
   posted:rows.filter(r=>r.journalId).length,nonPosting:rows.filter(r=>!r.journalId&&!r.error).length,
   migrationReversals:rows.reduce((n,r)=>n+(r.reversed||0),0),errors,before,after:await balances(c.id),sources:rows};
  report.companies.push(summary);report.errors.push(...errors.map(e=>({company:c.name,...e})));
 }
 // Every current ERP posting must match its expected role/account amounts.
 report.lineMismatches=(await db.query(`WITH expected AS(
 SELECT s.company_id,s.source_key,s.accounts->>(v->>'role') account_id,sum((v->>'amount')::numeric) amount
 FROM accountant_v2_erp_sources s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.signature->'lines','[]')) v
 WHERE s.company_id=ANY($1::text[]) GROUP BY 1,2,3),actual AS(
 SELECT s.company_id,s.source_key,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount
 FROM accountant_v2_erp_sources s JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=s.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL
 JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL
 WHERE s.company_id=ANY($1::text[]) GROUP BY 1,2,3)
 SELECT COALESCE(e.company_id,a.company_id) company_id,COALESCE(e.source_key,a.source_key) source_key,e.amount expected,a.amount actual
 FROM expected e FULL JOIN actual a USING(company_id,source_key,account_id) WHERE COALESCE(e.amount,0)<>COALESCE(a.amount,0)`,[companies.map(c=>c.id)])).rows;
 report.unbalanced=(await db.query(`SELECT j.id FROM accountant_v2_manual_journals j LEFT JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL WHERE j.company_id=ANY($1::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL GROUP BY j.id HAVING COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0)<>0`,[companies.map(c=>c.id)])).rows;
 report.paymentDifferences=(await db.query(`WITH native AS(
 SELECT s.company_id,s.source_key,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount
 FROM accountant_v2_erp_sources s JOIN accountant_v2_manual_journal_lines l ON l.journal_id=s.journal_id AND l.company_id=s.company_id
 JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id WHERE s.company_id=ANY($1::text[]) AND a.account_type IN ('CASH','BANK') AND l.deleted_at IS NULL GROUP BY 1,2,3
 ),legacy AS(
 SELECT j.company_id,lower(split_part(j.reference_number,':',1))||':'||substr(j.reference_number,strpos(j.reference_number,':')+1) source_key,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount
 FROM accountant_v2_manual_journals j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id
 JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id WHERE j.company_id=ANY($1::text[]) AND j.source_type='LEGACY_CASH_BANK_HISTORY' AND j.reference_number ~ '^(BILL|EXPENSE):' AND a.account_type IN ('CASH','BANK') AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY 1,2,3
 ) SELECT COALESCE(n.company_id,o.company_id) company_id,COALESCE(n.source_key,o.source_key) source_key,COALESCE(n.account_id,o.account_id) account_id,COALESCE(o.amount,0)::text migrated,COALESCE(n.amount,0)::text source_posting,(COALESCE(n.amount,0)-COALESCE(o.amount,0))::text difference
 FROM native n FULL JOIN legacy o USING(company_id,source_key,account_id) WHERE COALESCE(n.amount,0)<>COALESCE(o.amount,0)`,[companies.map(c=>c.id)])).rows;
 report.blocked=!!(report.errors.length||report.lineMismatches.length||report.unbalanced.length);
 if(!report.blocked){
  report.repeatChanges=0;
  for(const c of report.companies){
   const rows=(await db.query(`SELECT pg_temp.import_erp_history_source($1,x.kind,x.id) result FROM jsonb_to_recordset($2::jsonb) x(kind text,id text)`,[c.companyId,JSON.stringify(c.sources)])).rows;
   for(const {result:r} of rows){if(r.error)throw Error(r.error);report.repeatChanges+=r.changed+r.reversed;}
  }
  if(report.repeatChanges)throw Error('Repeat verification would change accounting');
 }
 if(apply&&!report.blocked){await db.query('COMMIT');report.applied=true;}else await db.query('ROLLBACK');
 writeFileSync(file,JSON.stringify(report,null,2));
 console.log(JSON.stringify({applied:report.applied,blocked:report.blocked,report:file,companies:report.companies.map(({sources,before,after,...c})=>c),lineMismatches:report.lineMismatches.length,unbalanced:report.unbalanced.length,repeatChanges:report.repeatChanges},null,2));
 if(report.blocked)process.exitCode=2;
}catch(e){await db.query('ROLLBACK');report.error=e.message;writeFileSync(file,JSON.stringify(report,null,2));throw e;}
finally{db.release();await pool.end();}
