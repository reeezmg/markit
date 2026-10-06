import 'dotenv/config';
import {Pool} from 'pg';
import {writeFileSync} from 'node:fs';
const company='6980e6e4-7d5d-413c-9554-24f385c9b853';
const ids=['4266d003-fd17-411c-99df-fff12646ec1a','25b48c87-783c-453c-aed3-0210e0818c53','1af8f72d-a8eb-4fbf-9b00-cfbc6f8d4f55','14d8c3ae-7af0-406b-9883-8d3ed6cfea85','d8e473fc-cc1f-4ba3-aacf-1d19ff9c0d97','b814874d-e518-4bf0-8ac8-ae843e4756cc','e04aad09-c5de-4d5b-aa95-2d9e457d23d3','949d2a91-0aed-43fe-b8b8-edd9bfa5065d','bd131773-3dc3-4391-829a-18b4c3d98e96'];
const args=process.argv.slice(2), get=k=>args.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3);
for(const a of args)if(a!=='--apply'&&!['backup','report'].some(k=>a.startsWith('--'+k+'=')))throw Error('Unknown option');
const apply=args.includes('--apply');
if(apply&&!get('backup'))throw Error('--backup is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect();
const report={applied:false,companyId:company};
try{
 await db.query('BEGIN');
 const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw Error('Invalid schema');
 await db.query(`SET LOCAL search_path TO "${schema}"`);
 await db.query("SET LOCAL lock_timeout='15s'");
 await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[company]);
 await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[company]);
 await db.query("SELECT set_config('app.accountant_user','authorized-nine-payment-removal',true)");
 const payments=(await db.query('SELECT * FROM distributor_payments WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY id FOR UPDATE',[company,ids])).rows;
 if(payments.length===0){report.alreadyRemoved=true;await db.query('ROLLBACK');}
 else{
  if(payments.length!==9||payments.some(p=>p.payment_type!=='BANK'))throw Error('Expected nine bank payments');
  const total=Math.round(payments.reduce((s,p)=>s+Number(p.amount),0)*100);
  if(total!==24924200)throw Error('Payment amounts changed');
  const ledger=(await db.query("SELECT * FROM account_ledger_entries WHERE company_id=$1 AND source_type='DISTRIBUTOR_PAYMENT' AND source_id=ANY($2::text[])",[company,ids])).rows;
  if(ledger.length)throw Error('Old ledger now contains these payments; review before removal');
  const sources=(await db.query("SELECT * FROM accountant_v2_distributor_sources WHERE company_id=$1 AND source_key=ANY($2::text[])",[company,ids.map(i=>'payment:'+i)])).rows;
  if(sources.length!==9||sources.some(s=>!s.journal_id))throw Error('Expected nine posted source links');
  const journalIds=sources.map(s=>s.journal_id);
  const journals=(await db.query('SELECT * FROM accountant_v2_manual_journals WHERE company_id=$1 AND id=ANY($2::text[])',[company,journalIds])).rows;
  const lines=(await db.query('SELECT * FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND journal_id=ANY($2::text[])',[company,journalIds])).rows;
  const balance=async()=>Number((await db.query(`SELECT COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END),0)::text balance FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id WHERE j.company_id=$1 AND a.is_primary AND a.account_type='BANK' AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL`,[company])).rows[0].balance);
  report.before=await balance();
  const linkedExpenses=(await db.query('SELECT * FROM expenses WHERE company_id=$1 AND id=ANY($2::text[])',[company,payments.map(p=>p.expense_id).filter(Boolean)])).rows;
  const originalViewDefinition=(await db.query("SELECT pg_get_viewdef('accountant_v2_distributor_events'::regclass,true) definition")).rows[0].definition;
  if(get('backup'))writeFileSync(get('backup'),JSON.stringify({companyId:company,capturedAt:new Date().toISOString(),payments,sources,journals,lines,ledger,linkedExpenses,originalViewDefinition},null,2)+'\n',{flag:'wx'});
  // Keep linked expense ownership and old source data. Filter only explicitly
  // authorized new-account exclusions; the normal sync produces audit reversals.
  const definition=(await db.query("SELECT pg_get_viewdef('accountant_v2_distributor_events'::regclass,true) definition")).rows[0].definition.trim().replace(/;$/,'');
  if(!definition.includes('authorized-distributor-exclusion')){
   await db.query(`CREATE OR REPLACE VIEW accountant_v2_distributor_events AS SELECT v.* FROM (${definition}) v WHERE NOT EXISTS (SELECT 1 FROM accountant_v2_accountant_audit a WHERE a.company_id=v.company_id AND a.resource='authorized-distributor-exclusion' AND a.action='excluded' AND a."resourceId"=v.distributor_id||':'||v.source_key)`);
  }
  for(const source of sources)await db.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at) VALUES('exclusion-'||$3,$1,'authorized-nine-payment-removal','excluded','authorized-distributor-exclusion',$2,$4::jsonb,now()) ON CONFLICT(id) DO NOTHING`,[company,source.distributor_id+':'+source.source_key,source.journal_id,JSON.stringify({reason:'User explicitly requested removal from new accounts',originalJournalId:source.journal_id,paymentId:source.source_key.slice(8)})]);
  for(const supplier of new Set(sources.map(s=>s.distributor_id)))await db.query('SELECT accountant_v2_sync_distributor($1,$2)',[company,supplier]);
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  report.after=await balance();
  if(Math.round((report.after-report.before)*100)!==24924200)throw Error('Unexpected Primary Bank balance change; rolling back');
  const reversals=await db.query("SELECT id,entry_number,total,reversed_from_id FROM accountant_v2_manual_journals WHERE company_id=$1 AND source_type='DISTRIBUTOR_REVERSAL' AND reversed_from_id=ANY($2::text[]) AND deleted_at IS NULL",[company,journalIds]);
  if(reversals.rowCount!==9)throw Error('Expected nine accounting reversals');
  for(const supplier of new Set(sources.map(s=>s.distributor_id))){const repeat=await db.query('SELECT accountant_v2_sync_distributor($1,$2) changed',[company,supplier]);if(Number(repeat.rows[0].changed)!==0)throw Error('Repeat sync recreated excluded entries');}
  if(await balance()!==report.after)throw Error('Repeat sync changed balance');
  report.removedFromNewAccounts=9;report.oldSourceRowsPreserved=true;report.amount=249242;report.reversals=reversals.rows;
  await db.query(apply?'COMMIT':'ROLLBACK');report.applied=apply;
 }
}catch(e){await db.query('ROLLBACK');report.error=e.message;process.exitCode=1;}
finally{db.release();await pool.end();if(get('report'))writeFileSync(get('report'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
