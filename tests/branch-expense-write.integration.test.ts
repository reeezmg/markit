import 'dotenv/config';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { writeFileSync } from 'node:fs';
import { createError, createEvent, defineEventHandler, getHeader, getQuery, getRequestURL, readBody } from 'h3';
import { pool } from '../server/db';
import { prisma } from '../server/prisma';
import { legacyLedgerGuard } from './legacy-ledger-guard';

const db = await pool.connect(), connect = pool.connect.bind(pool), poolQuery = pool.query.bind(pool);
const originalFind = prisma.expense.findUnique.bind(prisma.expense), own = new Set<string>();
const report: any = { startedAt: new Date().toISOString(), schemaChanges: false, mode: 'actual handlers; rollback-only', results: [], cleanup: 'pending' };
let depth = 0, legacy: (() => Promise<void>) | undefined;
async function query(sql: string, args?: any[]) {
  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|SCHEMA|FUNCTION|INDEX|TRIGGER|TYPE)\b/i);
  if (sql === 'BEGIN') return db.query(`SAVEPOINT expense_${++depth}`);
  if (sql === 'COMMIT') {
    await db.query('SET CONSTRAINTS ALL IMMEDIATE'); await db.query('SET CONSTRAINTS ALL DEFERRED'); await legacy?.();
    return db.query(`RELEASE SAVEPOINT expense_${depth--}`);
  }
  if (sql === 'ROLLBACK') {
    const name = `expense_${depth--}`;
    await db.query(`ROLLBACK TO SAVEPOINT ${name}`); return db.query(`RELEASE SAVEPOINT ${name}`);
  }
  return db.query(sql, args);
}
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await db.query("SET LOCAL lock_timeout='5s'");
  legacy = await legacyLedgerGuard(db);
  const pair = (await db.query(`SELECT h.id head,b.id branch,hu.user_id FROM companies h
    JOIN company_users hu ON hu.company_id=h.id AND hu.role='admin' AND hu.status AND NOT hu.deleted
    JOIN companies b ON b.parent_company_id=h.id AND b.status
    JOIN company_users bu ON bu.company_id=b.id AND bu.user_id=hu.user_id AND bu.status AND NOT bu.deleted
    WHERE h.is_head_office AND h.parent_company_id IS NULL AND h.status ORDER BY h.id,b.id LIMIT 1`)).rows[0];
  assert.ok(pair);
  const session = { data: { id: pair.user_id, companyId: pair.head, role: 'admin' } };
  Object.assign(globalThis, { createError, defineEventHandler, getHeader, getQuery, getRequestURL, readBody,
    requireAuthSession: async () => session, useAuthSession: async () => session });
  (pool as any).connect = async () => ({ query, release() {} }); (pool as any).query = query;
  (prisma.expense as any).findUnique = async (args: any) => own.has(args.where.id)
    ? (await db.query('SELECT company_id AS "companyId" FROM expenses WHERE id=$1', [args.where.id])).rows[0] ?? null : originalFind(args);
  const middleware = (await import('../server/middleware/company-request')).default;
  const create = (await import('../server/api/accounts/expenses.post')).default;
  const update = (await import('../server/api/accounts/expenses/[id].put')).default;
  const remove = (await import('../server/api/accounts/expenses/[id].delete')).default;
  const status = (await import('../server/api/accounts/expenses/status.post')).default;
  async function call(handler: any, method: string, companyId: string, body: any, id?: string) {
    const json = JSON.stringify(body), req = Readable.from([Buffer.from(json)]) as any;
    req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)), 'x-company-id': companyId };
    req.method = method; req.url = '/api/accounts/expenses' + (id ? '/' + id : handler === status ? '/status' : '');
    const event = createEvent(req, {} as any); event.context.params = id ? { id } : {};
    event.context.authorizedCompanyIds = Promise.resolve(session.data.companyId === pair.head ? [pair.head, pair.branch] : [pair.branch]);
    await middleware(event); return handler(event);
  }
  for (const role of ['head', 'branch'] as const) {
    const companyId = pair[role]; session.data.companyId = companyId;
    const category = (await db.query('SELECT id FROM expense_categories WHERE company_id=$1 LIMIT 1', [companyId])).rows[0];
    assert.ok(category, `${role}: an existing expense category is required`);
    const body = { companyId, userId: pair.user_id, expensecategoryId: category.id, expenseDate: new Date().toISOString(),
      totalAmount: 118, taxAmount: 18, recoverableTaxAmount: 8, status: 'Pending', paymentMode: 'CASH', note: 'BRANCH_E2E_EXPENSE_WRITE' };
    const created = await call(create, 'POST', companyId, body); own.add(created.id);
    const enabled = (await db.query('SELECT enabled FROM accountant_v2_erp_settings WHERE company_id=$1', [companyId])).rows[0]?.enabled === true;
    assert.equal(enabled, true, `${role}: enable ERP accounting before this posting test`);
    async function expectNative(expected: Record<string, number>) {
      if (!enabled) return;
      const rows = (await db.query(`SELECT a.account_type,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount
        FROM accountant_v2_erp_sources s JOIN accountant_v2_manual_journal_lines l ON l.journal_id=s.journal_id
        JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id
        WHERE s.company_id=$1 AND s.source_key=$2 AND l.deleted_at IS NULL GROUP BY a.account_type`,
        [companyId, 'expense:' + created.id])).rows;
      const totals: Record<string, number> = {};
      for (const row of rows) {
        const type = row.account_type === 'OTHER_EXPENSE' ? 'EXPENSE' : row.account_type;
        totals[type] = (totals[type] || 0) + Number(row.amount);
      }
      assert.deepEqual(totals, expected, role + ': native expense accounting');
    }
    assert.ok(Number(created.expenseNumber) > 0);
    const row = (await db.query('SELECT company_id,total_amount,recoverable_tax_amount FROM expenses WHERE id=$1', [created.id])).rows[0];
    assert.equal(row.company_id, companyId); assert.equal(Number(row.total_amount), 118); assert.equal(Number(row.recoverable_tax_amount), 8);
    await expectNative({ EXPENSE: 110, OTHER_CURRENT_ASSET: 8, OTHER_CURRENT_LIABILITY: -118 });
    await call(update, 'PUT', companyId, { ...body, status: 'Paid', paymentMode: 'BANK', note: 'BRANCH_E2E_EXPENSE_EDITED' }, created.id);
    assert.equal((await db.query('SELECT note FROM expenses WHERE id=$1', [created.id])).rows[0].note, 'BRANCH_E2E_EXPENSE_EDITED');
    await expectNative({ EXPENSE: 110, OTHER_CURRENT_ASSET: 8, BANK: -118 });
    await assert.rejects(call(update, 'PUT', companyId, { ...body, recoverableTaxAmount: 19 }, created.id));
    assert.equal(Number((await db.query('SELECT recoverable_tax_amount FROM expenses WHERE id=$1', [created.id])).rows[0].recoverable_tax_amount), 8);
    assert.equal((await call(status, 'POST', companyId, { ids: [created.id], status: 'Pending' })).count, 1);
    await expectNative({ EXPENSE: 110, OTHER_CURRENT_ASSET: 8, OTHER_CURRENT_LIABILITY: -118 });
    assert.equal((await call(status, 'POST', companyId, { ids: [created.id], status: 'Paid' })).count, 1);
    await expectNative({ EXPENSE: 110, OTHER_CURRENT_ASSET: 8, BANK: -118 });
    if (role === 'head') {
      session.data.companyId = pair.branch;
      await assert.rejects(call(update, 'PUT', pair.branch, { ...body, companyId: pair.branch }, created.id));
      session.data.companyId = pair.head;
    }
    await call(remove, 'DELETE', companyId, {}, created.id);
    assert.equal((await db.query('SELECT id FROM expenses WHERE id=$1', [created.id])).rowCount, 0);
    await expectNative({});
    await legacy();
    report.results.push({ company: role, status: 'passed', nativeAccounting: enabled ? 'posted amounts and reversals verified' : 'existing ERP connection disabled',
      checks: ['create', 'owner-and-amount', 'included-tax-and-partial-recovery', 'edit', 'invalid-recovery-rejected', 'status-changes', ...(role === 'head' ? ['branch-cross-company-update-rejected'] : []), 'delete', 'legacy-archive-unchanged'] });
    console.log(`PASS ${role}: expense create/edit/status/delete and validation`);
  }
} catch (error: any) {
  report.error = { message: error.statusMessage || error.message, statusCode: error.statusCode }; process.exitCode = 1;
} finally {
  (pool as any).connect = connect; (pool as any).query = poolQuery; (prisma.expense as any).findUnique = originalFind;
  await db.query('ROLLBACK');
  assert.equal((await db.query('SELECT count(*)::int count FROM expenses WHERE id=ANY($1::text[])', [[...own]])).rows[0].count, 0);
  report.cleanup = 'verified: expense fixtures and all transaction effects rolled back'; report.finishedAt = new Date().toISOString();
  writeFileSync('tests/branch-reports/expense-writes-followup.json', JSON.stringify(report, null, 2) + '\n');
  db.release(); await pool.end(); await prisma.$disconnect();
  console.log(report.error ? 'FAIL: see expense-writes-followup.json' : 'PASS: both-role expense write tests; rollback cleanup verified');
}
