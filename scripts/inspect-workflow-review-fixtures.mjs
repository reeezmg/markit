import 'dotenv/config';
import fs from 'node:fs';
import {Pool} from 'pg';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const c=await pool.connect();
try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const out={at:new Date().toISOString()};
 out.staff=(await c.query("SELECT user_id,company_id,name FROM company_users WHERE name LIKE 'Scope staff %' ORDER BY company_id")).rows;
 out.users=(await c.query("SELECT id,email FROM users WHERE email LIKE 'scope-%@example.invalid' ORDER BY id")).rows;
 out.ledger=(await c.query("SELECT id,user_id,company_id,note FROM user_ledger_entries WHERE note LIKE 'Scope user credit %'")).rows;
 out.money=(await c.query("SELECT id,company_id,note FROM money_transactions WHERE note LIKE 'Scope user credit %'")).rows;
 out.scopeCounts=(await c.query(`SELECT
  (SELECT count(*) FROM clients WHERE name LIKE 'Scope client %') clients,
  (SELECT count(*) FROM shifts WHERE name LIKE 'Scope shift %') shifts,
  (SELECT count(*) FROM company_holidays WHERE name LIKE 'Scope holiday %') holidays`)).rows;
 const before=JSON.parse(fs.readFileSync('scripts/production-accounting/runs/workflow-review-2026-10-06/persisted-before.json'));
 out.changedTables=[];
 for(const t of before.tables){
  const now=(await c.query(`SELECT count(*)::int rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) digest FROM (SELECT md5(to_jsonb(t)::text) h FROM public."${t.table}" t) x`)).rows[0];
  if(now.rows!==t.rows||now.digest!==t.digest) out.changedTables.push({table:t.table,before:t.rows,now:now.rows});
 }
 fs.writeFileSync('scripts/production-accounting/runs/workflow-review-2026-10-06/fixture-inspection.json',JSON.stringify(out,null,2));
 console.log(JSON.stringify(out,null,2));
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
