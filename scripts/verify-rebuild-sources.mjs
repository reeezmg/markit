import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
const audit = JSON.parse(readFileSync('../artifacts/source-rebuild-audit.json', 'utf8'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
const db = await pool.connect();
const report = { readOnly: true, at: new Date().toISOString(), checked: 0, needsRepost: [], errors: [] };
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw Error('Invalid schema');
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query("SET LOCAL statement_timeout='60s'");
  const ids = audit.companies.map(c => c.id);
  const sources = (await db.query(`SELECT company_id,source_key FROM accountant_v2_erp_sources WHERE company_id=ANY($1::text[])
    UNION SELECT company_id,'bill:'||id FROM bills WHERE company_id=ANY($1::text[])
    UNION SELECT company_id,'expense:'||id FROM expenses WHERE company_id=ANY($1::text[])
    ORDER BY company_id,source_key`, [ids])).rows;
  async function check(rows) {
    await db.query('SAVEPOINT source_check');
    try {
      await db.query(`SELECT sum(accountant_v2_sync_erp(company_id,upper(split_part(source_key,':',1)),
        substr(source_key,strpos(source_key,':')+1),true)) FROM jsonb_to_recordset($1::jsonb) x(company_id text,source_key text)`, [JSON.stringify(rows)]);
      await db.query('RELEASE SAVEPOINT source_check');
      report.checked += rows.length;
    } catch (error) {
      await db.query('ROLLBACK TO SAVEPOINT source_check');
      await db.query('RELEASE SAVEPOINT source_check');
      if (rows.length > 1) {
        const mid = Math.floor(rows.length / 2);
        await check(rows.slice(0,mid)); await check(rows.slice(mid));
      } else {
        const target = error.code === '25006' ? report.needsRepost : report.errors;
        target.push({ ...rows[0], error: error.message });
        report.checked++;
      }
    }
  }
  for (let i=0;i<sources.length;i+=500) {
    await check(sources.slice(i,i+500));
    if (i % 5000 === 0) console.log(JSON.stringify({ checked: report.checked, total: sources.length, needsRepost: report.needsRepost.length, errors: report.errors.length }));
  }
  await db.query('ROLLBACK');
  const reportPath = process.argv.find(a=>a.startsWith('--report='))?.slice(9) || '../artifacts/source-rebuild-source-check.json';
  writeFileSync(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({ checked: report.checked, needsRepost: report.needsRepost.length, errors: report.errors.length }));
} finally { await db.query('ROLLBACK'); db.release(); await pool.end(); }
