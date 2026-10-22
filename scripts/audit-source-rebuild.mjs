import 'dotenv/config';
import { Pool } from 'pg';
import { mkdirSync, writeFileSync } from 'node:fs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
const db = await pool.connect();
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw Error('Invalid schema');
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query("SET LOCAL statement_timeout='60s'");
  const companies = (await db.query("SELECT id,name FROM companies WHERE lower(name) LIKE '%originals%' OR lower(name) LIKE '%shobika%' OR lower(name) LIKE '%city%center%' ORDER BY name")).rows;
  const ids = companies.map(c => c.id);
  const report = { capturedAt: new Date().toISOString(), readOnly: true, companies };
  report.journalTypes = (await db.query(`SELECT company_id,source_type,count(*)::int count,
    count(*) FILTER(WHERE reversed_from_id IS NOT NULL)::int reversals
    FROM accountant_v2_manual_journals WHERE company_id=ANY($1::text[]) AND deleted_at IS NULL AND status='PUBLISHED'
    GROUP BY company_id,source_type ORDER BY company_id,source_type`, [ids])).rows;
  report.balances = (await db.query(`SELECT a.company_id,a.id,a.name,a.account_type,
    COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END*j.exchange_rate),0)::text balance
    FROM accountant_v2_accounting_accounts a LEFT JOIN accountant_v2_manual_journal_lines l
    ON l.company_id=a.company_id AND l.account_id=a.id AND l.deleted_at IS NULL
    LEFT JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL
    WHERE a.company_id=ANY($1::text[]) GROUP BY a.company_id,a.id ORDER BY a.company_id,a.name`, [ids])).rows;
  report.columns = (await db.query(`SELECT table_name,column_name,data_type FROM information_schema.columns
    WHERE table_schema=$1 AND (table_name LIKE 'accountant_v2_%' OR table_name IN ('bills','expenses','purchase_orders')) ORDER BY table_name,ordinal_position`, [schema])).rows;
  report.functions = (await db.query(`SELECT p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.prokind='f'
    AND p.proname LIKE 'accountant_v2_%'`, [schema])).rows;
  report.foreignKeys = (await db.query(`SELECT conrelid::regclass::text AS table_name,pg_get_constraintdef(oid) definition
    FROM pg_constraint WHERE contype='f' AND confrelid='accountant_v2_manual_journals'::regclass`)).rows;
  report.journalIndexes = (await db.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename='accountant_v2_manual_journals'",[schema])).rows;
  report.journalTriggers = (await db.query(`SELECT tgrelid::regclass::text table_name,tgname,pg_get_triggerdef(oid) definition
    FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('accountant_v2_manual_journals'::regclass,'accountant_v2_manual_journal_lines'::regclass)`)).rows;
  report.locks = (await db.query('SELECT * FROM accountant_v2_transaction_locks WHERE company_id=ANY($1::text[]) AND is_locked AND deleted_at IS NULL', [ids])).rows;
  report.legacyRemaining = (await db.query(`SELECT j.company_id,j.id,j.source_type,j.source_id,j.reference_number,j.notes
    FROM accountant_v2_manual_journals j WHERE company_id=ANY($1::text[]) AND source_type LIKE 'LEGACY%'
    AND deleted_at IS NULL AND status='PUBLISHED' AND NOT EXISTS(SELECT 1 FROM accountant_v2_manual_journals r WHERE r.reversed_from_id=j.id AND r.deleted_at IS NULL AND r.status='PUBLISHED')`, [ids])).rows;
  report.erpCoverage = (await db.query(`SELECT s.company_id,split_part(s.source_key,':',1) kind,
    count(*)::int tracked,count(*) FILTER(WHERE s.signature->>'excluded'='true')::int excluded,
    count(*) FILTER(WHERE s.journal_id IS NOT NULL)::int current_postings
    FROM accountant_v2_erp_sources s WHERE company_id=ANY($1::text[]) GROUP BY 1,2`, [ids])).rows;
  report.erpMissing = (await db.query(`SELECT b.company_id,'bill:'||b.id source_key FROM bills b
    WHERE b.company_id=ANY($1::text[]) AND NOT b.deleted AND NOT b.is_markit AND b.type='BILL' AND b.payment_status IN ('PAID','PENDING')
    AND NOT EXISTS(SELECT 1 FROM accountant_v2_erp_sources s WHERE s.company_id=b.company_id AND s.source_key='bill:'||b.id AND s.journal_id IS NOT NULL)
    UNION ALL SELECT e.company_id,'expense:'||e.id FROM expenses e WHERE e.company_id=ANY($1::text[])
    AND upper(e.status::text) IN ('PAID','PENDING','UNPAID') AND NOT EXISTS(SELECT 1 FROM distributor_payments p WHERE p.company_id=e.company_id AND p.expense_id=e.id)
    AND NOT EXISTS(SELECT 1 FROM accountant_v2_erp_sources s WHERE s.company_id=e.company_id AND s.source_key='expense:'||e.id AND s.journal_id IS NOT NULL)`, [ids])).rows;
  report.missingDetails = (await db.query(`SELECT b.company_id,'bill:'||b.id source_key,b.grand_total::text amount,
    b.payment_status::text status,b.created_at date,s.signature,s.accounts FROM bills b
    LEFT JOIN accountant_v2_erp_sources s ON s.company_id=b.company_id AND s.source_key='bill:'||b.id
    WHERE b.company_id=ANY($1::text[]) AND NOT b.deleted AND NOT b.is_markit AND b.type='BILL' AND b.payment_status IN ('PAID','PENDING') AND s.journal_id IS NULL
    UNION ALL SELECT e.company_id,'expense:'||e.id,e.total_amount::text,e.status::text,e.expense_date,s.signature,s.accounts
    FROM expenses e LEFT JOIN accountant_v2_erp_sources s ON s.company_id=e.company_id AND s.source_key='expense:'||e.id
    WHERE e.company_id=ANY($1::text[]) AND upper(e.status::text) IN ('PAID','PENDING','UNPAID') AND s.journal_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM distributor_payments p WHERE p.company_id=e.company_id AND p.expense_id=e.id)`, [ids])).rows;
  report.purchaseCoverage = (await db.query(`SELECT p.company_id,count(*)::int total,
    count(*) FILTER(WHERE p.total_amount>0)::int positive,
    count(*) FILTER(WHERE p.total_amount>0 AND NOT EXISTS(
      SELECT 1 FROM accountant_v2_distributor_sources s WHERE s.company_id=p.company_id AND s.source_key='purchase:'||p.id AND s.journal_id IS NOT NULL
    ) AND NOT EXISTS(
      SELECT 1 FROM accountant_v2_accountant_audit a WHERE a.company_id=p.company_id AND a.resource='purchase-order-source-state' AND a."resourceId"=p.id
      AND a."after"->>'journalId' IS NOT NULL
    ))::int positive_without_posting
    FROM purchase_orders p WHERE p.company_id=ANY($1::text[]) GROUP BY p.company_id`,[ids])).rows;
  report.unassignedPurchaseLineMismatches = (await db.query(`WITH state AS (
    SELECT DISTINCT ON(company_id,"resourceId") company_id,"resourceId" source_id,"after" body
    FROM accountant_v2_accountant_audit WHERE company_id=ANY($1::text[]) AND resource='purchase-order-source-state'
    ORDER BY company_id,"resourceId",("after"->>'revision')::int DESC
  ), expected AS (
    SELECT company_id,source_id,body->'accounts'->>'payable' account_id,-(body->'signature'->>'gross')::numeric amount FROM state WHERE body->'signature'->>'kind'='PURCHASE'
    UNION ALL SELECT company_id,source_id,body->'accounts'->>'stock',(body->'signature'->>'gross')::numeric-(body->'signature'->>'tax')::numeric FROM state WHERE body->'signature'->>'kind'='PURCHASE'
    UNION ALL SELECT company_id,source_id,body->'accounts'->>'tax',(body->'signature'->>'tax')::numeric FROM state WHERE body->'signature'->>'kind'='PURCHASE'
  ), actual AS (
    SELECT s.company_id,s.source_id,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount FROM state s
    JOIN accountant_v2_manual_journals j ON j.company_id=s.company_id AND j.id=s.body->>'journalId' AND j.status='PUBLISHED' AND j.deleted_at IS NULL
    JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL GROUP BY 1,2,3
  ) SELECT coalesce(e.company_id,a.company_id) company_id,coalesce(e.source_id,a.source_id) source_id FROM expected e FULL JOIN actual a USING(company_id,source_id,account_id)
    WHERE coalesce(e.amount,0)<>coalesce(a.amount,0)`,[ids])).rows;
  await db.query('ROLLBACK');
  mkdirSync('../artifacts', { recursive: true });
  const path = process.argv.find(a=>a.startsWith('--report='))?.slice(9) || '../artifacts/source-rebuild-audit.json';
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ companies, journalTypes: report.journalTypes, report: path }, null, 2));
} finally {
  await db.query('ROLLBACK');
  db.release();
  await pool.end();
}
