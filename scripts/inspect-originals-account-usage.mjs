import fs from 'node:fs';
import dotenv from 'dotenv';
import { Pool } from 'pg';
dotenv.config({ quiet: true });
const dir = 'scripts/production-accounting/runs/originals-settings-selection-2026-10-06';
fs.mkdirSync(dir, { recursive: true });
const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
const db = await pool.connect();
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query('SET LOCAL search_path TO public');
  const companies = (await db.query("SELECT id,name FROM companies WHERE name ILIKE '%original%' ORDER BY name")).rows;
  if (companies.length !== 1) throw Error('Originals company is ambiguous: ' + companies.map(c => c.name).join(', '));
  const company = companies[0], id = company.id;
  const accounts = (await db.query(`SELECT a.id,a.name,a.code,a.account_type::text AS type,a.category::text AS category,
    a.is_active,a.deleted_at,a.is_primary, count(l.id)::int AS posted_rows,
    COALESCE(sum(l.amount*j.exchange_rate),0)::text AS posted_amount
    FROM accountant_v2_accounting_accounts a
    LEFT JOIN accountant_v2_manual_journal_lines l ON l.account_id=a.id AND l.company_id=a.company_id AND l.deleted_at IS NULL
      AND EXISTS(SELECT 1 FROM accountant_v2_manual_journals j WHERE j.id=l.journal_id AND j.company_id=l.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL)
    LEFT JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
    WHERE a.company_id=$1 GROUP BY a.id ORDER BY a.account_type,a.name`, [id])).rows;
  const usage = (await db.query(`SELECT l.account_id,j.source_type,count(*)::int AS rows
    FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
    WHERE l.company_id=$1 AND l.deleted_at IS NULL AND j.deleted_at IS NULL AND j.status='PUBLISHED'
    GROUP BY l.account_id,j.source_type ORDER BY l.account_id,j.source_type`, [id])).rows;
  const settings = {};
  for (const [key,table] of [['erp','accountant_v2_erp_settings'],['staff','accountant_v2_user_settings'],['online','accountant_v2_ecommerce_settings']])
    settings[key] = (await db.query(`SELECT enabled,accounts FROM ${table} WHERE company_id=$1`, [id])).rows[0] || null;
  const defaults = (await db.query(`SELECT DISTINCT ON("resourceId") "resourceId" AS group,"after" AS mappings
    FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='account-defaults' AND action='configured' AND deleted_at IS NULL
    ORDER BY "resourceId",created_at DESC,id DESC`, [id])).rows;
  const profit = (await db.query(`SELECT "after" AS settings FROM accountant_v2_accountant_audit
    WHERE company_id=$1 AND resource='investor-profit-settings' AND action='configured' AND deleted_at IS NULL
    ORDER BY created_at DESC,id DESC LIMIT 1`, [id])).rows[0] || null;
  const suppliers = (await db.query(`SELECT m.role,m.account_id,count(*)::int AS suppliers
    FROM accountant_v2_distributor_mappings m WHERE m.company_id=$1 GROUP BY m.role,m.account_id ORDER BY m.role,m.account_id`, [id])).rows;
  const investorAccounts = (await db.query('SELECT id,name,accounts FROM accountant_v2_investors WHERE company_id=$1', [id])).rows;
  const report = { at: new Date().toISOString(), readOnly: true, company, accounts, usage, settings, defaults, profit, suppliers, investorAccounts };
  fs.writeFileSync(`${dir}/account-usage.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await db.query('ROLLBACK'); db.release(); await pool.end(); }
