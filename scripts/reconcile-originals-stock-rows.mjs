import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';

// Authorized Originals stock-row and new-account reconciliation, 2026-10-11.
// Preview is strictly read-only. Apply changes quantities, then invokes the
// installed stock-control function; it never installs or changes DB schemas.
const args = process.argv.slice(2);
assert.ok(args.every(arg => arg === '--apply' || /^--(company-id|company-name|report-prefix)=.+$/.test(arg)), 'Unknown option');
const option = name => {
  const matches = args.filter(arg => arg.startsWith(`--${name}=`));
  assert.ok(matches.length <= 1, `Duplicate ${name}`);
  return matches[0]?.slice(name.length + 3);
};
const target = [option('company-id'), option('company-name'), option('report-prefix')];
assert.ok(target.every(Boolean) || target.every(value => value === undefined), 'Custom target requires company-id, company-name and report-prefix');
const companyId = target[0] || '6980e6e4-7d5d-413c-9554-24f385c9b853';
const companyName = target[1] || 'ORIGINALS CLOTHING';
const prefix = target[2] || 'originals';
assert.match(companyId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
assert.match(prefix, /^[a-z0-9-]+$/);
const apply = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15000 });
const db = await pool.connect();
const dir = new URL('../../artifacts/stock-reconciliation/', import.meta.url);
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportFile = new URL(`${prefix}-${apply ? 'repaired' : 'audit'}-${stamp}.json`, dir);
const report = { companyId, at: new Date().toISOString(), applied: false,
  rule: 'qty = initial_qty - sold_qty - supplier_return_qty' };
const stockCtes = `supplier_returns AS (
  SELECT ri.item_id, sum(ri.qty)::int returned_qty FROM purchase_return_items ri
  JOIN purchase_returns pr ON pr.id=ri.purchase_return_id WHERE pr.company_id=$1 GROUP BY ri.item_id
), billed AS (
  SELECT e.item_id, sum(CASE WHEN e.return THEN -e.qty ELSE e.qty END) billed_qty
  FROM entries e JOIN bills b ON b.id=e.bill_id WHERE b.company_id=$1 AND NOT COALESCE(b.deleted,false) GROUP BY e.item_id
), stock_rows AS (
  SELECT i.id,i.barcode,i.size,i.initial_qty,i.sold_qty,i.qty current_qty,
    COALESCE(r.returned_qty,0) supplier_return_qty,
    COALESCE(i.initial_qty,0)-COALESCE(i.sold_qty,0)-COALESCE(r.returned_qty,0) expected_qty,
    COALESCE(b.billed_qty,0) billed_qty,v.id variant_id,v.p_price,p.id product_id,p.name product_name,p.purchaseorder_id,
    i.qty IS DISTINCT FROM (COALESCE(i.initial_qty,0)-COALESCE(i.sold_qty,0)-COALESCE(r.returned_qty,0)) mismatch
  FROM items i JOIN variants v ON v.id=i.variant_id AND v.company_id=i.company_id
  JOIN products p ON p.id=v.product_id AND p.company_id=i.company_id
  LEFT JOIN supplier_returns r ON r.item_id=i.id LEFT JOIN billed b ON b.item_id=i.id WHERE i.company_id=$1
)`;
const query = async sql => (await db.query(sql, [companyId])).rows;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function sourceFingerprints() {
  const tables = ['products','variants','purchase_orders','purchase_returns','bills','entries','distributor_credits','distributor_payments','account_ledger_entries'];
  const result = {};
  for (const table of tables) {
    result[table] = (await query(`SELECT count(*)::int rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) digest
      FROM (SELECT md5(to_jsonb(t)::text) h FROM ${table} t WHERE company_id=$1) x`))[0];
  }
  result.purchase_return_items = (await query(`SELECT count(*)::int rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) digest
    FROM (SELECT md5(to_jsonb(ri)::text) h FROM purchase_return_items ri JOIN purchase_returns pr ON pr.id=ri.purchase_return_id WHERE pr.company_id=$1) x`))[0];
  return result;
}
async function accountingBackup() {
  return {
    stockControl: await query('SELECT * FROM accountant_v2_stock_control WHERE company_id=$1'),
    accounts: await query('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1 ORDER BY id'),
    journals: await query('SELECT * FROM accountant_v2_manual_journals WHERE company_id=$1 ORDER BY id'),
    lines: await query('SELECT * FROM accountant_v2_manual_journal_lines WHERE company_id=$1 ORDER BY id'),
    erpSources: await query('SELECT * FROM accountant_v2_erp_sources WHERE company_id=$1 ORDER BY source_key'),
    distributorSources: await query('SELECT * FROM accountant_v2_distributor_sources WHERE company_id=$1 ORDER BY distributor_id,source_key'),
  };
}
function assertBalanced(auditResult) {
  assert.equal(Number(auditResult.trialBalance.difference), 0, 'New accounting debits and credits must balance');
  assert.equal(auditResult.unbalancedJournals.length, 0, 'Every published journal must balance');
  assert.equal(auditResult.erpSourceMismatches.length, 0, 'ERP source postings must tally');
  assert.equal(auditResult.payableMismatches.length, 0, 'Supplier payable balances must tally');
  assert.equal(auditResult.distributorLineMismatches.length, 0, 'Every supplier source posting line must tally');
}
async function audit() {
  const rows = await query(`WITH ${stockCtes} SELECT *,round((COALESCE(current_qty,0)-expected_qty)::numeric*COALESCE(p_price,0)::numeric,2)::text value_overstatement FROM stock_rows ORDER BY barcode,id`);
  const summary = (await query(`WITH ${stockCtes} SELECT count(*)::int rows,count(*) FILTER(WHERE mismatch)::int mismatches,
    sum(COALESCE(initial_qty,0))::text initial_qty,sum(COALESCE(sold_qty,0))::text sold_qty,
    sum(supplier_return_qty)::text supplier_returns,sum(COALESCE(current_qty,0))::text current_qty,sum(expected_qty)::text expected_qty,
    round(sum(COALESCE(current_qty,0)::numeric*COALESCE(p_price,0)::numeric),2)::text current_value,
    round(sum(expected_qty::numeric*COALESCE(p_price,0)::numeric),2)::text expected_value,
    count(*) FILTER(WHERE expected_qty<0)::int negative_stock_rows,
    count(*) FILTER(WHERE COALESCE(sold_qty,0)::numeric<>billed_qty)::int sold_counter_vs_bill_mismatches FROM stock_rows`))[0];
  assert.equal(rows.length, Number((await query('SELECT count(*) n FROM items WHERE company_id=$1'))[0].n), 'Every company item must have company-owned product/variant relations');
  const stockAccounts = await query(`WITH ${stockCtes}, expected AS (
    SELECT s->>'account_id' id,round(COALESCE(sum(r.expected_qty::numeric*COALESCE(r.p_price,0)::numeric),0),2) value
    FROM jsonb_array_elements(accountant_v2_stock_snapshot($1)) s LEFT JOIN stock_rows r ON r.product_id=s->>'product_id' GROUP BY 1
  ), current_source AS (
    SELECT s->>'account_id' id,round(sum((s->>'value')::numeric),2) value FROM jsonb_array_elements(accountant_v2_stock_snapshot($1)) s GROUP BY 1
  ), posted AS (
    SELECT l.account_id id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount*j.exchange_rate ELSE -l.amount*j.exchange_rate END) value
    FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
    WHERE l.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY 1
  ) SELECT a.id,a.name,COALESCE(e.value,0)::text expected_value,COALESCE(cs.value,0)::text current_source_value,
    round(COALESCE(p.value,0),2)::text ledger_value,round(COALESCE(p.value,0)-COALESCE(e.value,0),2)::text difference
    FROM accountant_v2_accounting_accounts a LEFT JOIN expected e ON e.id=a.id LEFT JOIN current_source cs ON cs.id=a.id LEFT JOIN posted p ON p.id=a.id
    WHERE a.company_id=$1 AND a.account_type='STOCK' AND a.deleted_at IS NULL ORDER BY a.id`);
  const accounts = await query(`WITH posted AS (
    SELECT l.account_id,sum(CASE WHEN l.side='DEBIT' THEN l.amount*j.exchange_rate ELSE 0 END) debit,
      sum(CASE WHEN l.side='CREDIT' THEN l.amount*j.exchange_rate ELSE 0 END) credit
    FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
    WHERE l.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY l.account_id
  ) SELECT a.id,a.code,a.name,a.account_type,a.deleted_at,
    round(COALESCE(p.debit,0),2)::text debit,round(COALESCE(p.credit,0),2)::text credit,
    round(COALESCE(p.debit,0)-COALESCE(p.credit,0),2)::text balance
    FROM accountant_v2_accounting_accounts a LEFT JOIN posted p ON p.account_id=a.id WHERE a.company_id=$1 ORDER BY a.code,a.id`);
  const trialBalance = (await query(`SELECT count(DISTINCT j.id)::int journals,
    round(sum(CASE WHEN l.side='DEBIT' THEN l.amount*j.exchange_rate ELSE 0 END),2)::text debit,
    round(sum(CASE WHEN l.side='CREDIT' THEN l.amount*j.exchange_rate ELSE 0 END),2)::text credit,
    round(sum(CASE l.side WHEN 'DEBIT' THEN l.amount*j.exchange_rate ELSE -l.amount*j.exchange_rate END),2)::text difference
    FROM accountant_v2_manual_journals j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL
    WHERE j.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL`))[0];
  const unbalancedJournals = await query(`SELECT j.id,j.entry_number,j.source_type,
    sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)::text difference
    FROM accountant_v2_manual_journals j LEFT JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL
    WHERE j.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL GROUP BY j.id HAVING COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0)<>0`);
  const erpSourceMismatches = await query(`WITH expected AS (
    SELECT s.source_key,s.accounts->>(v->>'role') account_id,sum((v->>'amount')::numeric) amount
    FROM accountant_v2_erp_sources s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.signature->'lines','[]')) v WHERE s.company_id=$1 GROUP BY 1,2
  ), actual AS (
    SELECT s.source_key,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount
    FROM accountant_v2_erp_sources s JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=s.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL
    JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL WHERE s.company_id=$1 GROUP BY 1,2
  ) SELECT COALESCE(e.source_key,a.source_key) source_key,COALESCE(e.account_id,a.account_id) account_id,e.amount::text expected,a.amount::text actual
    FROM expected e FULL JOIN actual a USING(source_key,account_id) WHERE COALESCE(e.amount,0)<>COALESCE(a.amount,0)`);
  const payableMismatches = await query(`WITH expected AS (
    SELECT distributor_id,sum(CASE WHEN kind IN ('PAYMENT','RETURN') THEN -amount ELSE amount END) balance FROM accountant_v2_distributor_events WHERE company_id=$1 GROUP BY 1
  ), actual AS (
    SELECT l.distributor_id,sum(CASE l.side WHEN 'CREDIT' THEN l.amount ELSE -l.amount END) balance
    FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
    JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
    WHERE l.company_id=$1 AND a.account_type='ACCOUNTS_PAYABLE' AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY 1
  ) SELECT s.distributor_id,COALESCE(e.balance,0)::text expected,COALESCE(a.balance,0)::text actual
    FROM accountant_v2_distributor_settings s LEFT JOIN expected e USING(distributor_id) LEFT JOIN actual a USING(distributor_id)
    WHERE s.company_id=$1 AND s.enabled AND COALESCE(e.balance,0)<>COALESCE(a.balance,0)`);
  const distributorLineMismatches = await query(`WITH events AS (
    SELECT e.*,s.accounts,s.journal_id FROM accountant_v2_distributor_events e
    JOIN accountant_v2_distributor_settings cfg ON cfg.company_id=e.company_id AND cfg.distributor_id=e.distributor_id AND cfg.enabled
    LEFT JOIN accountant_v2_distributor_sources s ON s.company_id=e.company_id AND s.distributor_id=e.distributor_id AND s.source_key=e.source_key WHERE e.company_id=$1
  ), expected AS (
    SELECT company_id,distributor_id,source_key,accounts->>'payable' account_id,CASE WHEN kind IN ('PAYMENT','RETURN') THEN amount ELSE -amount END amount FROM events
    UNION ALL SELECT company_id,distributor_id,source_key,accounts->>'stock',CASE WHEN kind='RETURN' THEN -(abs(amount)-tax) ELSE abs(amount)-tax END FROM events WHERE kind IN ('PURCHASE','RETURN')
    UNION ALL SELECT company_id,distributor_id,source_key,accounts->>'tax',CASE WHEN kind='RETURN' THEN -tax ELSE tax END FROM events WHERE kind IN ('PURCHASE','RETURN')
    UNION ALL SELECT company_id,distributor_id,source_key,CASE WHEN kind='OPENING' THEN accounts->>'opening' WHEN mode='CASH' THEN accounts->>'cash' WHEN bank_id IS NOT NULL THEN accounts->>('bank:'||bank_id) ELSE accounts->>'bank' END,CASE WHEN kind='PAYMENT' THEN -amount ELSE amount END FROM events WHERE kind NOT IN ('PURCHASE','RETURN')
  ), expected_totals AS (
    SELECT company_id,distributor_id,source_key,account_id,sum(amount) amount FROM expected GROUP BY 1,2,3,4
  ), actual AS (
    SELECT e.company_id,e.distributor_id,e.source_key,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount
    FROM events e JOIN accountant_v2_manual_journals j ON j.id=e.journal_id AND j.company_id=e.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL
    JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL GROUP BY 1,2,3,4
  ) SELECT COALESCE(e.source_key,a.source_key) source_key,COALESCE(e.account_id,a.account_id) account_id,e.amount::text expected,a.amount::text actual
    FROM expected_totals e FULL JOIN actual a USING(company_id,distributor_id,source_key,account_id) WHERE COALESCE(e.amount,0)<>COALESCE(a.amount,0)`);
  return { summary, rows, stockAccounts, accounts, trialBalance, unbalancedJournals, erpSourceMismatches, payableMismatches, distributorLineMismatches };
}

try {
  await db.query(apply ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const schema = new URL(url).searchParams.get('schema') || 'public';
  assert.match(schema, /^[A-Za-z_][A-Za-z0-9_]*$/);
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query("SET LOCAL statement_timeout='60s'");
  await db.query("SET LOCAL lock_timeout='10s'");
  report.company = (await query('SELECT name FROM companies WHERE id=$1'))[0]?.name;
  assert.equal(report.company, companyName);
  report.stockControl = (await query('SELECT company_id,enabled,revision,initialized_at FROM accountant_v2_stock_control WHERE company_id=$1'))[0];
  assert.ok(report.stockControl?.enabled, 'Existing stock control must be enabled');
  if (apply) {
    // Freeze source changes during the backed-up, atomic cutover. These are
    // transaction locks only; they do not alter tables or any other schema.
    await db.query('LOCK TABLE products,variants,items,purchase_orders,purchase_returns,purchase_return_items,bills,entries,distributor_credits,distributor_payments IN SHARE MODE');
    await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))", [companyId]);
  }
  report.before = await audit();
  if (apply) {
    assertBalanced(report.before);
    const preservedSources = await sourceFingerprints();
    const items = await query('SELECT * FROM items WHERE company_id=$1 ORDER BY id');
    const accounting = await accountingBackup();
    assert.ok(accounting.stockControl[0].initialized_at, 'This correction requires existing initialized stock control');
    const backupFile = new URL(`${prefix}-backup-${stamp}.json`, dir);
    writeFileSync(backupFile, JSON.stringify({ companyId, at: report.at, items, accounting, preservedSources, audit: report.before }, null, 2), { flag: 'wx' });
    report.backup = fileURLToPath(backupFile);
    console.log('Backup saved. Correcting quantity mismatches and reconciling the existing Stock account.');

    // Avoid one full accounting reconciliation per changed row. Flush the
    // installed deferred triggers with their existing reentry guard, then run
    // the normal reconciliation once against the complete corrected inventory.
    await db.query("SELECT set_config('app.stock_sync',$1,true)", [companyId]);
    const repaired = await db.query(`WITH ${stockCtes} UPDATE items i SET qty=r.expected_qty,updated_at=now()
      FROM stock_rows r WHERE i.id=r.id AND i.company_id=$1 AND r.mismatch RETURNING i.id`, [companyId]);
    assert.equal(repaired.rowCount, report.before.summary.mismatches);
    report.repairedRows = repaired.rowCount;
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query("SELECT set_config('app.stock_sync','',true)");
    report.adjustmentJournals = (await query('SELECT accountant_v2_sync_stock($1) n'))[0].n;
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    report.repeatReconciliationChanges = (await query('SELECT accountant_v2_sync_stock($1) n'))[0].n;
    assert.equal(report.repeatReconciliationChanges, 0, 'Repeating reconciliation must post nothing');
    report.after = await audit();
    assertBalanced(report.after);
    assert.equal(report.after.summary.mismatches, 0, 'Every item must tally');
    assert.ok(report.after.stockAccounts.every(row => Number(row.difference) === 0), 'Each new Stock account must equal corrected inventory valuation');
    const afterItems = await query('SELECT * FROM items WHERE company_id=$1 ORDER BY id');
    assert.deepEqual(afterItems.map(({qty,updated_at,...item})=>item), items.map(({qty,updated_at,...item})=>item), 'Initial, sold and all non-quantity fields must be preserved');
    assert.deepEqual(await sourceFingerprints(), preservedSources, 'Old ledgers and source documents must be preserved');
    const afterAccounting = await accountingBackup();
    const existingJournalIds = new Set(accounting.journals.map(row=>row.id));
    const existingLineIds = new Set(accounting.lines.map(row=>row.id));
    assert.equal(hash(afterAccounting.journals.filter(row=>existingJournalIds.has(row.id))), hash(accounting.journals), 'Existing new-account journals must remain intact');
    assert.equal(hash(afterAccounting.lines.filter(row=>existingLineIds.has(row.id))), hash(accounting.lines), 'Existing new-account lines must remain intact');
    for (const key of ['accounts','erpSources','distributorSources']) assert.equal(hash(afterAccounting[key]),hash(accounting[key]), `${key} must be preserved`);
    const allowedAccounts = new Set([accounting.stockControl[0].adjustment_account_id, ...report.before.stockAccounts.map(row=>row.id)]);
    assert.deepEqual(report.after.accounts.filter(row=>!allowedAccounts.has(row.id)), report.before.accounts.filter(row=>!allowedAccounts.has(row.id)), 'Only Stock and Inventory Adjustments balances may change');
    const oldIds = new Set(accounting.journals.map(row=>row.id));
    report.newJournals = afterAccounting.journals.filter(row=>!oldIds.has(row.id));
    assert.ok(report.newJournals.every(row=>row.source_type==='STOCK_CONTROL'), 'Only stock-control adjustment journals may be added');
    report.preserved = { initialAndSold: true, oldLedgersAndSourceDocuments: true, existingAccountingJournals: true, unrelatedAccountBalances: true };
    await db.query('COMMIT');
    report.applied = true;
    // Independent, read-only verification after the committed repair.
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await db.query(`SET LOCAL search_path TO "${schema}"`);
    report.committed = await audit();
    assert.equal(report.committed.summary.mismatches,0);
    assert.ok(report.committed.stockAccounts.every(row=>Number(row.difference)===0));
    assertBalanced(report.committed);
    await db.query('ROLLBACK');
  } else await db.query('ROLLBACK');
  const final = report.committed || report.before;
  const csv = (rows, keys) => [keys.join(','), ...rows.map(row=>keys.map(key=>'"'+String(row[key]??'').replaceAll('"','""')+'"').join(','))].join('\r\n')+'\r\n';
  report.rowCsv = fileURLToPath(new URL(`${prefix}-rows-${stamp}.csv`,dir));
  report.accountCsv = fileURLToPath(new URL(`${prefix}-accounts-${stamp}.csv`,dir));
  writeFileSync(report.rowCsv,csv(final.rows,['barcode','product_name','size','initial_qty','sold_qty','supplier_return_qty','current_qty','expected_qty','mismatch','billed_qty','p_price']));
  writeFileSync(report.accountCsv,csv(final.accounts,['code','name','account_type','debit','credit','balance']));
  writeFileSync(reportFile, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ report: fileURLToPath(reportFile), company: report.company, applied: report.applied,
    backup: report.backup,repairedRows: report.repairedRows,adjustmentJournals:report.adjustmentJournals,
    repeatReconciliationChanges:report.repeatReconciliationChanges,summary: final.summary,
    stockAccounts: final.stockAccounts, trialBalance: final.trialBalance,
    unbalancedJournals: final.unbalancedJournals.length, erpSourceMismatches: final.erpSourceMismatches.length,
    payableMismatches: final.payableMismatches.length,distributorLineMismatches:final.distributorLineMismatches.length,
    rowCsv:report.rowCsv,accountCsv:report.accountCsv }, null, 2));
} catch (error) {
  await db.query('ROLLBACK');
  report.error = error.message;
  writeFileSync(reportFile, JSON.stringify(report, null, 2), { flag: 'wx' });
  throw error;
} finally {
  db.release();
  await pool.end();
}
