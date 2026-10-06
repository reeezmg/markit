import 'dotenv/config';
import fs from 'node:fs';
import { Pool } from 'pg';
const dir='scripts/production-accounting/runs/legacy-disconnect-2026-10-06';
fs.mkdirSync(dir,{recursive:true});
const pool=new Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect();
try {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tables=(await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND (tablename LIKE 'accountant_v2_%' OR tablename IN ('companies','bills','entries','expenses','expense_categories','products','variants','items','purchase_orders','purchase_returns','purchase_return_items','distributor_payments','distributor_credits','distributor_companies','salary_payments','salary_configs','user_ledger_entries','user_credit_transactions','payroll_cycles','payroll_cycle_lines','payroll_adjustments','money_transactions','account_transfers','investments','bank_accounts','account_ledger_entries','cash_accounts','company_clients','statement_batches','statement_rows','statement_mappings')) ORDER BY tablename`)).rows;
  const fingerprints=[];
  for(const {tablename} of tables){if(!/^[a-z_0-9]+$/.test(tablename))throw Error('Invalid table');fingerprints.push({table:tablename,...(await c.query(`SELECT count(*)::int rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) digest FROM (SELECT md5(to_jsonb(t)::text) h FROM public."${tablename}" t)x`)).rows[0]});}
  const after=process.argv.includes('--after');
  fs.writeFileSync(`${dir}/${after?'after':'before'}.json`,JSON.stringify({at:new Date().toISOString(),fingerprints},null,2));
  const changes=after?fingerprints.filter(row=>JSON.stringify(row)!==JSON.stringify(JSON.parse(fs.readFileSync(`${dir}/before.json`,'utf8')).fingerprints.find(r=>r.table===row.table))):[];
  const result={trackedTables:fingerprints.length,unchanged:!changes.length,changes};
  if(after)fs.writeFileSync(`${dir}/persisted-verification.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
  if(changes.length)process.exitCode=1;
} finally {await c.query('ROLLBACK');c.release();await pool.end();}
