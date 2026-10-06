import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import {
  createEvent,
  createError,
  defineEventHandler,
  getQuery,
  getHeader,
  getRequestURL,
  readBody,
  setHeader,
} from 'h3';
import ExcelJS from 'exceljs';
import { pool } from '../server/db';
import { prisma } from '../server/prisma';
const db = await pool.connect(),
  originalQuery = pool.query.bind(pool),
  originalConnect = pool.connect.bind(pool);
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get('schema') || 'public';
  assert.match(schema, /^[A-Za-z_][A-Za-z0-9_]*$/);
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  const companies = (
    await db.query(
      'SELECT company_id FROM accountant_v2_erp_settings WHERE enabled ORDER BY company_id'
    )
  ).rows.map((r) => r.company_id);
  assert.ok(companies.length);
  let company = companies[0];
  let cleanupMode = false,
    recordBaseline = true;
  const budgets: Record<string, number> = {
    account: 1,
    profit: 2,
    report: 3,
    summary: 4,
    online: 1,
    gstr1: 2,
    gstr2b: 2,
    gstr3b: 3,
  };
  let queryCount = 0;
  const results: Record<string, any> = {};
  const metrics: Record<string, number> = {};
  const query = (q: any, args: any) => {
    queryCount++;
    return db.query(q, args);
  };
  const session = () => ({
    data: {
      id: 'report-verification',
      companyId: company,
      role: 'manager',
      type: 'admin',
      cleanup: cleanupMode,
      isTaxIncluded: true,
    },
  });
  Object.assign(globalThis, {
    defineEventHandler,
    createError,
    getQuery,
    getHeader,
    getRequestURL,
    readBody,
    setHeader,
    useAuthSession: async () => session(),
    requireAuthSession: async () => session(),
  });
  (pool as any).query = query;
  (pool as any).connect = async () => ({ query, release() {} });
  const names = ['account', 'profit', 'report', 'summary', 'online', 'gstr1', 'gstr2b', 'gstr3b'];
  const handlers = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        (await import('../server/api/report/' + name + '.get')).default,
      ])
    )
  );
  const call = async (handler: any, extra: any = {}) => {
    const query = new URLSearchParams({
      from: '2025-01-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2026-09-30T23:59:59.999Z',
      ai: 'false',
      ...extra,
    });
    const req = Readable.from([]) as any;
    req.method = 'GET';
    req.url = '/api/report/test?' + query;
    req.headers = { 'x-company-id': company, 'x-company-filter': company };
    const headers: any = {};
    const event = createEvent(req, {
      setHeader(k: string, v: any) {
        headers[k] = v;
      },
      getHeader(k: string) {
        return headers[k];
      },
      removeHeader(k: string) {
        delete headers[k];
      },
    } as any);
    event.context.authorizedCompanyIds = Promise.resolve(companies);
    const before = queryCount;
    const value = await handler(event);
    const name = Object.keys(handlers).find((key) => handlers[key] === handler);
    if (name) {
      assert.ok(queryCount - before <= budgets[name], name + ' exceeded query budget');
    }
    if (name && recordBaseline) {
      const key = company + ':' + name;
      results[key] = JSON.parse(JSON.stringify(value));
      metrics[key] = queryCount - before;
    }
    return value;
  };
  for (const id of companies) {
    company = id;
    const account: any = await call(handlers.account),
      profit: any = await call(handlers.profit),
      daily: any = await call(handlers.report),
      summary: any = await call(handlers.summary);
    assert.equal(profit.summary.netProfit, account.pnl.netProfit);
    assert.equal(summary.profit.netProfit, account.pnl.netProfit);
    assert.equal(daily.balances.totalBalance, account.balances.total.delta);
    assert.equal(summary.balances.total.closing, account.balances.total.closing);
    assert.equal(account.balanceSheet.difference, 0);
    const online: any = await call(handlers.online);
    assert.ok(Number.isFinite(online.totalSales));
    for (const name of ['gstr1', 'gstr2b', 'gstr3b']) {
      const data: any = await call(handlers[name]);
      assert.equal(data.accounting.basis, 'posted-accounting');
    }
    console.log(
      JSON.stringify({
        company: id,
        netProfit: account.pnl.netProfit,
        cashBankClosing: account.balances.total.closing,
        consistent: true,
      })
    );
  }
  company = companies[0];
  for (const name of ['gstr1', 'gstr2b', 'gstr3b']) {
    const handler = (await import('../server/api/report/generate-' + name + '.excel.get')).default;
    const buffer = await call(handler);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    assert.ok(book.getWorksheet('Accounting comparison'));
    assert.ok(book.getWorksheet('Summary'));
  }
  const beforeExport = queryCount;
  const dailyExcel = await call(
    (
      await import('../server/api/report/generate-sales.excel.get')
    ).default
  );
  assert.equal(queryCount - beforeExport, 3);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(dailyExcel);
  assert.equal(
    book.getWorksheet('Summary')!.getCell('B7').value,
    results[company + ':account'].balances.total.delta
  );
  assert.equal(book.getWorksheet('Summary')!.getCell('B10').value, results[company + ':account'].balances.total.closing);
  assert.ok(book.getWorksheet('Cash and bank position'));
  for (const name of ['generate-profit.pdf', 'generate-sales.pdf', 'generate-summary.pdf']) {
    const buffer = await call((await import('../server/api/report/' + name + '.get')).default);
    assert.ok(Buffer.from(buffer).subarray(0, 4).toString() === '%PDF');
  }
  recordBaseline = false;
  // Cleanup reports must remain read-only; the schema is managed by migrations.
  for (const cleaned of ['false', 'true']) {
    cleanupMode = true;
    const daily: any = await call(handlers.report, { showCleanedValues: cleaned });
    assert.equal(
      daily.financial.balances.total.delta,
      results[company + ':account'].balances.total.delta
    );
  }
  cleanupMode = false;
  const empty = {
    from: '1900-01-01T00:00:00.000Z',
    to: '1900-01-02T00:00:00.000Z',
    startDate: '1900-01-01T00:00:00.000Z',
    endDate: '1900-01-02T00:00:00.000Z',
  };
  const emptyDaily: any = await call(handlers.report, empty);
  assert.equal(emptyDaily.totalSales, 0);
  assert.equal(emptyDaily.salaryExpense, 0);
  assert.equal(emptyDaily.balances.totalBalance, 0);
  await assert.rejects(call(handlers.account, { startDate: 'invalid' }), /valid date/);
  if (process.env.REPORT_BASELINE === 'write') {
    mkdirSync('.cache', { recursive: true });
    writeFileSync('.cache/report-baseline.json', JSON.stringify({ results, metrics }, null, 2));
  }
  if (process.env.REPORT_BASELINE === 'check') {
    const before = JSON.parse(readFileSync('.cache/report-baseline.json', 'utf8'));
    assert.deepEqual(results, before.results, 'Report payloads must remain unchanged');
    for (const key of Object.keys(metrics).filter((key) => key.startsWith(companies[0] + ':')))
      console.log(
        key.split(':')[1] + ': ' + before.metrics[key] + ' -> ' + metrics[key] + ' database queries'
      );
  }
  console.log(
    'PASS report APIs across all connected companies; financial totals agree; GST/daily Excel and profit/daily/summary PDF generated. Read-only database transaction.'
  );
} finally {
  (pool as any).query = originalQuery;
  (pool as any).connect = originalConnect;
  await db.query('ROLLBACK');
  db.release();
  await pool.end();
  await prisma.$disconnect();
}
