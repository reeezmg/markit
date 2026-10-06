import 'dotenv/config';
import {Pool} from 'pg';
import fs from 'node:fs';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try {
 const r=await pool.query(`SELECT pid,state,wait_event_type,wait_event,
  extract(epoch from now()-query_start)::int elapsed_seconds,
  pg_blocking_pids(pid) blockers,left(query,600) query
  FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
  AND (state<>'idle' OR application_name LIKE '%review%') ORDER BY query_start`);
 console.log(JSON.stringify(r.rows,null,2));
 if(process.argv.includes('--cancel-test-ddl')) {
  const blocked=r.rows.find(x=>x.query==='ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS opening_balance_date timestamp(3) without time zone'&&x.blockers.length===1);
  const holder=blocked&&r.rows.find(x=>x.pid===blocked.blockers[0]&&x.state==='idle in transaction'&&x.query==='SELECT id FROM bank_accounts WHERE company_id = $1 ORDER BY "createdAt" LIMIT 1');
  if(!blocked||!holder)throw Error('Expected test-only lock chain is absent; will not cancel anything');
  fs.writeFileSync('scripts/production-accounting/runs/workflow-review-2026-10-06/cold-ledger-schema-lock.json',JSON.stringify({at:new Date().toISOString(),observed:r.rows,explanation:'First ledger write waits for schema DDL on a second connection; its own open transaction holds the conflicting bank_accounts lock. The caller cannot finish until setup returns.'},null,2));
  console.log(JSON.stringify((await pool.query('SELECT pg_cancel_backend($1) cancelled',[blocked.pid])).rows));
 }
} finally {await pool.end();}
