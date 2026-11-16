import 'dotenv/config';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { dailyReport, type DailyReportContext } from '../server/utils/report-daily';
import { dailyReportBlock, dailyReportBlocks } from '../server/utils/report-daily-blocks';
import { accountingMoneyActivity } from '../server/utils/report-accounting';

// No fixtures, writes, or schema application. Fail closed at the PostgreSQL session.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6,
  connectionTimeoutMillis: 10000 });
const normalize = (value: any): any => Array.isArray(value)
  ? value.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  : value && typeof value === 'object' && !(value instanceof Date)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]))
    : typeof value === 'number' ? Number(value.toFixed(6)) : value;
try {
  const db = await pool.connect();
  let companyId: string;
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await db.query('SET LOCAL statement_timeout=45000');
    assert.equal((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on');
    const companies = await db.query(`SELECT id FROM companies
      WHERE ($1::text IS NULL OR id=$1) ORDER BY (name ILIKE '%city%center%') DESC,id LIMIT 1`,
      [process.env.REPORT_COMPANY_ID || null]);
    assert.ok(companies.rows.length, 'A report company must exist');
    companyId = companies.rows[0].id;
    for (const [from, to] of (process.env.REPORT_BENCHMARK_ONLY ? [] : [
      ['2026-07-08T00:00:00Z', '2026-07-09T23:59:59.999Z'],
      ['2025-11-16T00:00:00Z', '2026-11-16T23:59:59.999Z'],
      ['1900-01-01T00:00:00Z', '1900-01-02T23:59:59.999Z'],
    ])) {
      for (const [useOriginalCleanupValues, includeCleanupPrecedence] of [[false, false], [true, true]]) {
        const context: DailyReportContext = { companyId, startDate: new Date(from), endDate: new Date(to),
          useOriginalCleanupValues, includeCleanupPrecedence };
        const full = await dailyReport(db, context);
        for (const block of dailyReportBlocks) {
          const part: any = await dailyReportBlock(db, context, block);
          for (const [key, value] of Object.entries(part)) {
            if (key === 'salaryByPaymentMethod') {
              const expected: Record<string, number> = {};
              for (const row of full.salaryPayments) expected[row.paymentMode] = (expected[row.paymentMode] || 0) + row.amount;
              assert.deepEqual(normalize(value), normalize(expected));
            } else if (key === 'financial') {
              const financial = value as any;
              for (const field of ['cash', 'bank', 'receivable', 'total'])
                assert.deepEqual(normalize(financial.balances[field]), normalize(full.financial.balances[field]), field);
              assert.deepEqual(normalize(financial.accounts), normalize(full.financial.accounts.filter(
                account => ['CASH', 'BANK', 'ACCOUNTS_RECEIVABLE'].includes(account.type))));
              assert.equal(financial.currency, full.financial.currency);
              assert.equal(financial.pnl, undefined);
            } else assert.deepEqual(normalize(value), normalize(full[key]), `${block}.${key}`);
          }
        }
        // Compare SQL grouping with the previous per-line accumulation, including FX/reversals.
        const rawDb = { query: (sql: string, args?: any[]) => {
          const start = sql.indexOf('FROM (SELECT ');
          const end = sql.indexOf(') activity GROUP BY');
          return db.query(sql.slice(start + 6, end), args);
        } };
        assert.deepEqual(normalize(await accountingMoneyActivity(db, [companyId], context.startDate, context.endDate)),
          normalize(await accountingMoneyActivity(rawDb, [companyId], context.startDate, context.endDate)));
      }
      console.log('PASS daily block parity: ' + from.slice(0, 10) + ' to ' + to.slice(0, 10));
    }
    await db.query('ROLLBACK');
  } finally { db.release(); }
  const context: DailyReportContext = { companyId, startDate: new Date('2025-11-16T00:00:00Z'),
    endDate: new Date('2026-11-16T23:59:59.999Z'), useOriginalCleanupValues: false, includeCleanupPrecedence: false };
  const started = performance.now();
  const readOnlyDb = { query: async (sql: string, args?: any[]) => {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN READ ONLY');
      await connection.query('SET LOCAL statement_timeout=45000');
      return await connection.query(sql, args);
    } finally { await connection.query('ROLLBACK'); connection.release(); }
  } };
  const timings = await Promise.all(dailyReportBlocks.filter(block => block !== 'details').map(async block => {
    const start = performance.now();
    await dailyReportBlock(readOnlyDb, context, block);
    return { block, ms: Math.round(performance.now() - start) };
  }));
  console.log(JSON.stringify({ range: 'one year', ms: Math.round(performance.now() - started), timings }));
  if (!process.env.REPORT_BENCHMARK_ONLY)
    console.log('PASS read-only daily block parity: short/year/empty ranges, cleanup modes, grouped movements.');
} finally { await pool.end(); }
