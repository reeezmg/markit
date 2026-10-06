import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { accountingTestDatabaseUrl } from './lib/accounting-test-database.mjs';

// Verification only: integration suites own temporary schemas or outer rollbacks.
// Never runs deployment/import scripts. Keep a persisted-data fingerprint on both sides.
dotenv.config({ quiet: true });
const testDatabaseUrl = accountingTestDatabaseUrl(process.env.DATABASE_URL);
const resume = process.argv.includes('--resume');
const retryFailed = process.argv.includes('--retry-failed');
const rerun = process.argv.includes('--rerun');
if (retryFailed && !resume) throw Error('--retry-failed requires --resume so the original baseline is retained.');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
if (rerun && (!resume || !only)) throw Error('--rerun requires --resume and an explicit --only list; earlier evidence is archived.');
if (resume && !process.env.ACCOUNTING_REVIEW_DIR) throw Error('Set ACCOUNTING_REVIEW_DIR to the interrupted run when using --resume.');
const runStamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const dir = path.resolve(process.env.ACCOUNTING_REVIEW_DIR || `scripts/production-accounting/runs/workflow-review-${runStamp}`);
fs.mkdirSync(dir, { recursive: true });
if (!resume && fs.existsSync(path.join(dir, 'persisted-before.json'))) throw Error('This run already has a baseline. Choose a new ACCOUNTING_REVIEW_DIR or explicitly resume the interrupted run.');
const suites = [
  // The three older *company-pages suites commit fixtures and are unsuitable here.
  ...['accountant-v2-pages','distributor-accounting-pages','account-settings',
    'credit-payment','expense-tax','distributor-accounting-transactions','ecommerce-return',
    'ecomm-order-create','ecomm-order-cancel','ecomm-private-coupon','recurring-expenses',
    'payroll-attendance-shift','shift-policy','holiday-settings','attendance-calendar-request',
    'attendance-write','salary-safety','user-credit-input','report-gst-source',
    'document-status-history-api'].map(n => [`tests/${n}.test.ts`,
      ['ecomm-order-create','ecomm-order-cancel'].includes(n) ? 'outer rollback' : 'logic/page/mock']),
  ...['accountant-v2','accountant-money','erp-accounting','distributor-accounting',
    'user-accounting','investors','recurring-expenses','ecommerce-accounting',
    'report-accounting'].map(n => [`tests/${n}.integration.test.ts`, 'temporary schema']),
  ...['stock-accounting','purchase-order-authority','document-status-history',
    'transfer-history'].map(n => [`tests/${n}.integration.test.mjs`, 'temporary schema']),
  ['tests/company-scope.test.ts', 'outer rollback'],
  ['tests/account-ledger-writeflow.test.ts', 'outer rollback'],
  ...['erp-accounting-api','products-distributor-accounting-api','user-accounting-api']
    .map(n => [`tests/${n}.integration.test.ts`, 'outer rollback, injected auth']),
  ['tests/transaction-history.integration.test.mjs', 'outer rollback'],
  ['tests/report-pages.integration.test.ts', 'read-only, injected auth'],
  ['tests/legacy-accounting-disconnect.test.ts', 'logic/page/mock'],
  ['tests/legacy-accounting-policy.test.mjs', 'generated policy, no persistence'],
  ['tests/legacy-company-transfer.integration.test.ts', 'outer rollback'],
  ['tests/client-removal-accounting.test.mjs', 'outer rollback, actual Vue handler'],
  ['tests/account-settings-posting.integration.test.ts', 'temporary schema'],
  ['tests/account-settings-stock.integration.test.mjs', 'temporary schema, regression'],
  ['tests/account-settings-supplier.integration.test.ts', 'temporary schema, regression'],
  ['tests/account-settings-online-permissions.test.ts', 'logic/mock, regression'],
  ['scripts/probe-billing-ui-accounting.mjs', 'Vue handler mock, regression'],
  ['scripts/probe-statement-accounting.ts', 'native posting in temporary schema, regression + deferred ISO gap'],
  ['scripts/probe-erp-sidebar-accounting.ts', 'outer rollback, defect probe'],
  ['scripts/probe-account-settings-ui.mjs', 'Vue handler mock'],
  ['tests/erp-sidebar-compile.test.mjs', 'Vue script/template compiler, no database'],
];
if (only?.some(file => !suites.some(([known]) => known === file))) throw Error('Unknown suite in --only; no tests have run.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 20000, keepAlive: true });
pool.on('error', error => console.error(`Idle verification connection ended: ${error.code || error.message}`));
async function fingerprint() {
  const c = await pool.connect();
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const tables = (await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND (tablename LIKE 'accountant_v2_%' OR tablename IN
      ('companies','company_users','users','clients','company_clients','bills','entries','payments',
       'expenses','expense_categories','purchase_orders','products','variants','items','categories',
       'subcategories','distributor_companies','distributor_credits','distributor_payments',
       'purchase_returns','purchase_return_items','account_ledger_entries','bank_accounts',
       'account_transfers','money_transactions','investments','salary_payments','user_ledger_entries',
       'user_credit_transactions','payroll_cycles','payroll_cycle_lines','ecomm_orders',
       'ecomm_order_requests','document_status_history','recurring_expenses','recurring_expense_occurrences'))
      ORDER BY tablename`)).rows.map(r => r.tablename);
    const rows = [];
    for (const t of tables) {
      if (!/^[a-z_0-9]+$/.test(t)) throw Error('Invalid table name');
      rows.push({ table: t, ...(await c.query(`SELECT count(*)::int AS rows,
        md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS digest
        FROM (SELECT md5(to_jsonb(t)::text) h FROM public."${t}" t) x`)).rows[0] });
    }
    const schemas = (await c.query(`SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' ORDER BY nspname`)).rows.map(r => r.nspname);
    return { at: new Date().toISOString(), tables: rows, schemas };
  } finally { await c.query('ROLLBACK'); c.release(); }
}
const results = resume ? JSON.parse(fs.readFileSync(path.join(dir, 'test-results.json'))) : [];
const save = name => fs.writeFileSync(path.join(dir, name), JSON.stringify(results, null, 2));
const before = resume ? JSON.parse(fs.readFileSync(path.join(dir, 'persisted-before.json'))) : await fingerprint();
if (!resume) fs.writeFileSync(path.join(dir, 'persisted-before.json'), JSON.stringify(before, null, 2));
const company = (await pool.query('SELECT company_id FROM public.accountant_v2_erp_settings WHERE enabled ORDER BY company_id LIMIT 1')).rows[0].company_id;
try {
  for (const [file, isolation] of suites) {
    if (only && !only.includes(file)) continue;
    const previousIndex = results.findIndex(r => r.file === file), previous = results[previousIndex];
    if (previous && !rerun && (!retryFailed || previous.code === 0)) continue;
    const start = Date.now(), logName = path.basename(file) + '.log';
    const attempts = previous?.attempts || [];
    if (previous) {
      const archivedLog = logName + `.attempt-${attempts.length + 1}`;
      fs.copyFileSync(path.join(dir, previous.log), path.join(dir, archivedLog));
      const { attempts: ignored, ...prior } = previous;
      attempts.push({ ...prior, log: archivedLog });
    }
    console.log(`START ${file} (${isolation})`);
    const log = fs.openSync(path.join(dir, logName), 'w');
    const args = (file.endsWith('.ts') || file === 'tests/account-settings-stock.integration.test.mjs') ? ['--import', 'tsx', file] : [file];
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, args, {
        cwd: process.cwd(), env: { ...process.env, DATABASE_URL: testDatabaseUrl, COMPANY_ID: company, ACCOUNTING_REVIEW_DIR: dir }, stdio: ['ignore', log, log],
      });
      child.on('error', e => resolve({ code: null, error: e.message }));
      child.on('exit', (code, signal) => resolve({ code, signal }));
    });
    fs.closeSync(log);
    const recorded = { file, isolation, ...result, seconds: (Date.now() - start) / 1000, log: logName, ...(attempts.length ? { attempts } : {}) };
    if (previous) results[previousIndex] = recorded;
    else results.push(recorded);
    save('test-results.json');
    console.log(`${result.code === 0 ? 'PASS' : 'FAIL'} ${file} (${recorded.seconds}s)`);
  }
} finally {
  const after = await fingerprint();
  fs.writeFileSync(path.join(dir, 'persisted-after.json'), JSON.stringify(after, null, 2));
  const changes = after.tables.filter(t => JSON.stringify(t) !== JSON.stringify(before.tables.find(b => b.table === t.table)));
  const schemaChanges = after.schemas.filter(s => !before.schemas.includes(s));
  const removedSchemas = before.schemas.filter(s => !after.schemas.includes(s));
  const removedTables = before.tables.filter(t => !after.tables.some(a => a.table === t.table));
  fs.writeFileSync(path.join(dir, 'persisted-verification.json'), JSON.stringify({
    unchanged: !changes.length && !schemaChanges.length && !removedSchemas.length && !removedTables.length,
    changes, removedTables, removedSchemas, leftoverSchemas: schemaChanges,
    testedTables: after.tables.length, suites: results.length,
  }, null, 2));
  console.log(JSON.stringify({ passed: results.filter(r => r.code === 0).length, failed: results.filter(r => r.code !== 0).map(r => r.file), persistedTablesUnchanged: !changes.length, leftoverSchemas: schemaChanges }));
  await pool.end();
  if (results.some(r => r.code !== 0) || changes.length || schemaChanges.length || removedSchemas.length || removedTables.length) process.exitCode = 1;
}
