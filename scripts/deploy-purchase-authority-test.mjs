import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { installPurchaseOrderAuthority } from './production-accounting/lib/purchase-order-authority.mjs';
import { accountingTestDatabaseUrl } from './lib/accounting-test-database.mjs';

// Requires separate authorization for the SQL-object deployment, beyond db push.
assert.ok(process.argv.includes('--authorized-sql-deployment-on-test-database'));
const folder = 'tests/branch-reports';
const pool = new Pool({ connectionString: accountingTestDatabaseUrl(process.env.DATABASE_URL) });
const db = await pool.connect();
const source = readFileSync('scripts/production-accounting/lib/purchase-order-authority.sql', 'utf8');
const tables = ['purchase_orders', 'distributor_credits', 'distributor_payments', 'purchase_returns',
  'items', 'accountant_v2_distributor_sources', 'accountant_v2_manual_journals', 'accountant_v2_manual_journal_lines', 'accountant_v2_accountant_audit'];
tables.push('accountant_v2_distributor_events'); // Existing history projection must also stay unchanged.
async function fingerprints() {
  const values = {};
  for (const table of tables) values[table] = (await db.query(`SELECT count(*)::text count,
    md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) hash FROM "${table}" t`)).rows[0];
  return values;
}
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await db.query("SET LOCAL lock_timeout='10s'");
  await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2-migration'))");
  const before = await fingerprints();
  const views = (await db.query(`SELECT c.relname,pg_get_viewdef(c.oid,true) definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='v' AND c.relname=ANY($1::text[])`,
    [['accountant_v2_distributor_events', 'accountant_v2_distributor_events_before_po_authority']])).rows;
  const functions = (await db.query(`SELECT p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY($1::text[])`,
    [['accountant_v2_sync_unassigned_purchase', 'accountant_v2_purchase_authority_changed']])).rows;
  const triggers = (await db.query(`SELECT tgname,pg_get_triggerdef(oid) definition FROM pg_trigger
    WHERE tgname=ANY($1::text[])`, [['accountant_v2_dist_po_authority', 'accountant_v2_dist_credit_po_authority']])).rows;
  const sourceHash = createHash('sha256').update(source).digest('hex');
  writeFileSync(folder + '/purchase-authority-deployment-backup.json', JSON.stringify({ at: new Date().toISOString(), before, views, functions, triggers, sourceHash }, null, 2));
  await installPurchaseOrderAuthority(db);
  assert.deepEqual(await fingerprints(), before, 'Deployment must not change any source, stock, journal or audit rows');
  const view = (await db.query("SELECT pg_get_viewdef('accountant_v2_distributor_events'::regclass,true) definition")).rows[0].definition;
  assert.ok(view.includes('purchase-order-header-authority'));
  await db.query('COMMIT');
  writeFileSync(folder + '/purchase-authority-deployment.json', JSON.stringify({ finishedAt: new Date().toISOString(), sourceHash,
    status: 'passed', existingRowsUnchanged: true, historicalImports: false, source: 'scripts/production-accounting/lib/purchase-order-authority.sql' }, null, 2));
  console.log('PASS: repository purchase-accounting definitions deployed; source/stock/journal/audit rows unchanged.');
} catch (error) { await db.query('ROLLBACK'); throw error; }
finally { db.release(); await pool.end(); }
