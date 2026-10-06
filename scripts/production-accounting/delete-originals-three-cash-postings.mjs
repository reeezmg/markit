import 'dotenv/config';
import {Pool} from 'pg';
import {writeFileSync} from 'node:fs';
const company='6980e6e4-7d5d-413c-9554-24f385c9b853';
const ids=['d4cfa561-8dea-4c51-87a4-015ec2271f72','0883a9c8-5c84-441a-a30e-c6b2ac47c7a6','cb0fcbe3-9949-4acd-b6b2-8b90150a9411'];
const args=process.argv.slice(2),apply=args.includes('--apply');
const option=k=>args.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3);
for(const a of args)if(a!=='--apply'&&!['backup','report'].some(k=>a.startsWith('--'+k+'=')))throw Error('Unknown option');
if(apply&&!option('backup'))throw Error('--backup required');
const pool=new Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect();
const report={applied:false,companyId:company};
try{
 await db.query('BEGIN');
 await db.query("SET LOCAL lock_timeout='15s'");
 await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[company]);
 await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[company]);
 const payments=(await db.query('SELECT * FROM distributor_payments WHERE company_id=$1 AND id=ANY($2::text[]) FOR UPDATE',[company,ids])).rows;
 if(payments.length!==3||payments.some(p=>p.payment_type!=='CASH')||Math.round(payments.reduce((s,p)=>s+Number(p.amount),0)*100)!==2744000)throw Error('Expected exactly three cash payments totalling 27440');
 const sources=(await db.query('SELECT * FROM accountant_v2_distributor_sources WHERE company_id=$1 AND source_key=ANY($2::text[]) FOR UPDATE',[company,ids.map(id=>'payment:'+id)])).rows;
 if(sources.length!==3||sources.some(s=>!s.journal_id))throw Error('Expected three posted source links');
 const journalIds=sources.map(s=>s.journal_id);
 const journals=(await db.query('SELECT * FROM accountant_v2_manual_journals WHERE company_id=$1 AND id=ANY($2::text[]) FOR UPDATE',[company,journalIds])).rows;
 const lines=(await db.query('SELECT * FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND journal_id=ANY($2::text[])',[company,journalIds])).rows;
 if(journals.length!==3||journals.some(j=>j.source_type!=='DISTRIBUTOR'||j.status!=='PUBLISHED'||j.deleted_at))throw Error('Unexpected journals');
 const descendants=await db.query('SELECT id FROM accountant_v2_manual_journals WHERE company_id=$1 AND reversed_from_id=ANY($2::text[])',[company,journalIds]);
 if(descendants.rowCount)throw Error('Existing reversals require review');
 const balance=async()=>Number((await db.query(`SELECT COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END),0)::text balance FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id WHERE j.company_id=$1 AND a.account_type='CASH' AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL`,[company])).rows[0].balance);
 const count=async()=>Number((await db.query('SELECT count(*) FROM accountant_v2_manual_journals WHERE company_id=$1',[company])).rows[0].count);
 report.before=await balance();const beforeCount=await count();
 const definition=(await db.query("SELECT pg_get_viewdef('accountant_v2_distributor_events'::regclass,true) definition")).rows[0].definition;
 if(!definition.includes('authorized-distributor-exclusion'))throw Error('Required exclusion filter absent');
 if(option('backup'))writeFileSync(option('backup'),JSON.stringify({companyId:company,capturedAt:new Date().toISOString(),payments,sources,journals,lines},null,2)+'\n',{flag:'wx'});
 for(const s of sources){
  await db.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at) VALUES($1,$2,'authorized-three-cash-deletion','excluded','authorized-distributor-exclusion',$3,$4::jsonb,now())`,['cash-delete-exclusion-'+s.journal_id,company,s.distributor_id+':'+s.source_key,JSON.stringify({reason:'User requested hard deletion without reversals from new accounting',deletedJournalId:s.journal_id,paymentId:s.source_key.slice(8)})]);
 }
 // Remove the projection pointers first. Old supplier payments and linked expenses
 // remain intact; exclusions prevent automatic posting again on future sync.
 await db.query('DELETE FROM accountant_v2_distributor_sources WHERE company_id=$1 AND source_key=ANY($2::text[])',[company,ids.map(id=>'payment:'+id)]);
 const deleted=await db.query('DELETE FROM accountant_v2_manual_journals WHERE company_id=$1 AND id=ANY($2::text[])',[company,journalIds]);
 if(deleted.rowCount!==3)throw Error('Expected three deleted journals');
 for(const supplier of new Set(sources.map(s=>s.distributor_id))){
  const r=await db.query('SELECT accountant_v2_sync_distributor($1,$2) changed',[company,supplier]);
  if(Number(r.rows[0].changed)!==0)throw Error('Supplier sync changed other postings');
 }
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');
 report.after=await balance();
 if(Math.round((report.after-report.before)*100)!==2744000||await count()!==beforeCount-3)throw Error('Unexpected balance or journal count');
 if((await db.query('SELECT id FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND journal_id=ANY($2::text[])',[company,journalIds])).rowCount)throw Error('Journal lines remain');
 report.deletedJournals=3;report.deletedLines=lines.length;report.reversalsCreated=0;report.oldSourceRowsPreserved=true;
 await db.query(apply?'COMMIT':'ROLLBACK');report.applied=apply;
}catch(e){await db.query('ROLLBACK');report.error=e.message;process.exitCode=1;}
finally{db.release();await pool.end();if(option('report'))writeFileSync(option('report'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
