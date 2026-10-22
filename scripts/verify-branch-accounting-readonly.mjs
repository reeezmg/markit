import 'dotenv/config';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Pool } from 'pg';
const pool=new Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect();
const report={at:new Date().toISOString(),readOnly:true,companies:[],issues:[]};
try {
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const companies=(await db.query(`SELECT c.id,CASE WHEN c.is_head_office THEN 'head' ELSE 'branch' END role
   FROM companies c WHERE c.is_head_office OR c.parent_company_id IS NOT NULL ORDER BY c.is_head_office DESC,c.id`)).rows;
 for(const company of companies){
  const id=company.id,entry={role:company.role};
  const settings=(await db.query(`SELECT e.enabled erp,u.enabled staff FROM companies c LEFT JOIN accountant_v2_erp_settings e ON e.company_id=c.id
    LEFT JOIN accountant_v2_user_settings u ON u.company_id=c.id WHERE c.id=$1`,[id])).rows[0];
  assert.equal(settings.erp,true);assert.equal(settings.staff,true);
  entry.settings=settings;
  for(const [name,table] of [['erp','accountant_v2_erp_sources'],['staff','accountant_v2_user_sources']]){
   const mismatch=(await db.query(`WITH expected AS(
    SELECT s.source_key,s.accounts->>(v->>'role') account_id,sum((v->>'amount')::numeric) amount
    FROM ${table} s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.signature->'lines','[]')) v
    WHERE s.company_id=$1 GROUP BY 1,2),actual AS(
    SELECT s.source_key,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount
    FROM ${table} s JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=s.company_id
    JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id
    WHERE s.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY 1,2)
    SELECT count(*)::int n FROM expected e FULL JOIN actual a USING(source_key,account_id) WHERE COALESCE(e.amount,0)<>COALESCE(a.amount,0)`,[id])).rows[0].n;
   entry[name]={lineMismatches:mismatch,...(await db.query(`SELECT count(*) FILTER(WHERE signature->>'excluded'='true')::int historicalExcluded,
    count(journal_id)::int currentPostings FROM ${table} WHERE company_id=$1`,[id])).rows[0]};
   if(mismatch)report.issues.push({role:company.role,check:name+' source versus posted lines',count:mismatch});
  }
  const unbalanced=(await db.query(`SELECT count(*)::int n FROM (
   SELECT j.id FROM accountant_v2_manual_journals j LEFT JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.deleted_at IS NULL
   WHERE j.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL GROUP BY j.id
   HAVING count(l.id)<2 OR COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0)<>0) q`,[id])).rows[0].n;
  const foreign=(await db.query(`SELECT count(*)::int n FROM accountant_v2_manual_journal_lines l
   JOIN accountant_v2_manual_journals j ON j.id=l.journal_id JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id
   WHERE (l.company_id=$1 OR j.company_id=$1 OR a.company_id=$1) AND (l.company_id<>j.company_id OR l.company_id<>a.company_id)`,[id])).rows[0].n;
  entry.unbalancedJournals=unbalanced;entry.foreignCompanyLines=foreign;
  if(unbalanced)report.issues.push({role:company.role,check:'unbalanced journals',count:unbalanced});
  if(foreign)report.issues.push({role:company.role,check:'foreign company journal lines',count:foreign});
  report.companies.push(entry);
 }
 await db.query('ROLLBACK');report.passed=report.issues.length===0;
 writeFileSync('tests/branch-reports/branch-accounting-readonly.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));assert.equal(report.passed,true,'Accounting integrity checks failed');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
