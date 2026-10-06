import dotenv from 'dotenv';
import {Pool} from 'pg';
import {writeFileSync} from 'node:fs';
dotenv.config({quiet:true});
const db=new Pool({connectionString:process.env.DATABASE_URL});
const c=await db.connect();
try {
  await c.query('BEGIN');
  const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw new Error('Invalid schema');
  await c.query(`SET LOCAL search_path TO "${schema}"`);
  const repeated=await c.query(`SELECT company_id,distributor_id,accountant_v2_sync_distributor(company_id,distributor_id) AS changed FROM accountant_v2_distributor_settings WHERE enabled ORDER BY company_id,distributor_id`);
  const unbalanced=await c.query(`SELECT j.id FROM accountant_v2_manual_journals j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id
    WHERE j.source_type IN ('DISTRIBUTOR','DISTRIBUTOR_REVERSAL') GROUP BY j.id HAVING sum(CASE WHEN l.side='DEBIT' THEN l.amount ELSE -l.amount END)<>0`);
  const mismatches=await c.query(`WITH expected AS (
    SELECT company_id,distributor_id,sum(CASE WHEN kind IN ('PAYMENT','RETURN') THEN -amount ELSE amount END) AS balance
    FROM accountant_v2_distributor_events GROUP BY company_id,distributor_id), posted AS (
    SELECT l.company_id,l.distributor_id,sum(CASE WHEN l.side='CREDIT' THEN l.amount ELSE -l.amount END) AS balance
    FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id
    JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id WHERE a.account_type='ACCOUNTS_PAYABLE'
    AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY l.company_id,l.distributor_id)
    SELECT s.company_id,s.distributor_id,COALESCE(e.balance,0) expected,COALESCE(p.balance,0) posted FROM accountant_v2_distributor_settings s
    LEFT JOIN expected e ON e.company_id=s.company_id AND e.distributor_id=s.distributor_id
    LEFT JOIN posted p ON p.company_id=s.company_id AND p.distributor_id=s.distributor_id
    WHERE s.enabled AND COALESCE(e.balance,0)<>COALESCE(p.balance,0)`);
  const totals=await c.query(`SELECT c.name,count(DISTINCT s.distributor_id)::int distributors,count(DISTINCT src.journal_id)::int journals,
      count(DISTINCT src.source_key||s.distributor_id)::int sources
    FROM accountant_v2_distributor_settings s JOIN companies c ON c.id=s.company_id
    LEFT JOIN accountant_v2_distributor_sources src ON src.company_id=s.company_id AND src.distributor_id=s.distributor_id
    WHERE s.enabled GROUP BY c.name ORDER BY c.name`);
  const result={companies:totals.rows,repeatChanged:repeated.rows.reduce((s,r)=>s+r.changed,0),unbalanced:unbalanced.rows.length,mismatchedDistributors:mismatches.rows};
  if(result.repeatChanged||result.unbalanced||mismatches.rowCount)throw new Error(JSON.stringify(result));
  await c.query('COMMIT');
  writeFileSync('distributor-accounting-verification.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} catch(e) {await c.query('ROLLBACK');throw e;} finally {c.release();await db.end();}
