import assert from 'node:assert/strict'
import { test } from 'node:test'
import { documentListOptions } from '../server/utils/document-list'
import { quoteListQuery } from '../server/utils/quote-list'
import { invoiceListQuery } from '../server/utils/invoice-lists'
import { documentListDefaults, documentExportRows } from '../utils/erp-document-table'

test('document table parameters reject unsafe sorts, impossible dates, invalid ranges and unbounded pages', () => {
  const parse = (query: any) => documentListOptions(query, ['total'], 'total')
  for (const query of [
    { sort: 'id; DROP TABLE bills' }, { order: 'descending' }, { page: 0 }, { page: 1.5 },
    { pageSize: 501 }, { pageSize: -1 }, { from: '2026-02-30' },
    { from: '2026-10-28', to: '2026-10-01' }, { min: 'NaN' }, { min: -1 }, { min: 20, max: 10 },
  ]) assert.throws(() => parse(query))
  assert.deepEqual(parse({ page: 3, pageSize: 5, min: '0', max: '20.50', order: 'asc' }), {
    page: 3, pageSize: 5, sort: 'total', order: 'ASC', dates: {}, amounts: { min: 0, max: 20.5 },
  })
})

test('all three lists bind tenant, date and amount filters and paginate after filtering and sorting', () => {
  const input = { q: "customer's reference", from: '2026-10-01', to: '2026-10-28', min: '50', max: '200', page: 3, pageSize: 5, order: 'asc' }
  const cases = [
    quoteListQuery('company', { ...input, sort: 'total', status: 'ACCEPTED' }),
    invoiceListQuery(['company', 'branch'], { ...input, sort: 'balanceDue', state: 'overdue' }),
    invoiceListQuery(['company', 'branch'], { ...input, sort: 'amount', status: 'POS_CREDIT_REVERSED' }, true),
  ]
  for (const query of cases) {
    assert.deepEqual(query.values.slice(-2), [5, 10])
    assert.ok(query.values.includes('2026-10-01')); assert.ok(query.values.includes('2026-10-28'))
    assert.ok(query.values.includes(50)); assert.ok(query.values.includes(200))
    assert.doesNotMatch(query.sql, /customer's reference/)
    assert.match(query.sql, /ASC NULLS LAST,(?:"quoteNumber" DESC,)?id DESC LIMIT \$\d+ OFFSET \$\d+/)
    assert.match(query.sql, /FROM matched\) AS summary/)
    assert.doesNotMatch(query.sql, /\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/)
  }
  assert.equal(cases[0].values[0], 'company')
  assert.deepEqual(cases[1].values[0], ['company', 'branch'])
  assert.match(cases[1].sql, /b\.created_at >=/)
  assert.match(cases[2].sql, /p\.payment_date </)
  assert.match(cases[2].sql, /p\.status=\$\d+/)
  assert.throws(() => invoiceListQuery(['company'], { status: 'invalid' }, true))
  assert.throws(() => quoteListQuery('company', { status: 'invalid' }))
})

test('exports include every filtered page and retain the original filters if the user changes the screen', async () => {
  const filters = { ...documentListDefaults('quoteDate'), q: 'Customer', status: 'SENT', min: '100', page: 4, pageSize: 10 }
  const calls: any[] = []
  const rows = await documentExportRows(async query => {
    calls.push({ ...query })
    filters.q = 'Changed'; filters.status = 'DRAFT'
    const start = (query.page - 1) * query.pageSize
    return { rows: Array.from({ length: Math.min(500, 1003 - start) }, (_, offset) => ({ id: start + offset })), total: 1003 }
  }, filters)
  assert.equal(rows.length, 1003)
  assert.equal(new Set(rows.map(row => row.id)).size, 1003)
  assert.deepEqual(calls.map(call => [call.page, call.pageSize, call.q, call.status, call.min]), [
    [1, 500, 'Customer', 'SENT', '100'], [2, 500, 'Customer', 'SENT', '100'], [3, 500, 'Customer', 'SENT', '100'],
  ])
  assert.equal(filters.page, 4)
  await assert.rejects(documentExportRows(async () => { throw Error('Network failed') }, filters), /Network failed/)
})

test('read-only PostgreSQL validates every sortable column and summary for the three document lists', {
  skip: process.env.INVOICE_READONLY_DATABASE !== '1',
}, async () => {
  const dotenv = await import('dotenv'); dotenv.config({ quiet: true } as any)
  const { Client } = await import('pg')
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 })
  try {
    await db.connect(); await db.query('BEGIN READ ONLY')
    for (const [kind, sorts] of [
      ['quotes', ['quoteNumber', 'quoteDate', 'clientName', 'expiryDate', 'status', 'total']],
      ['invoices', ['invoiceNumber', 'clientName', 'invoiceDate', 'dueDate', 'grandTotal', 'amountReceived', 'balanceDue', 'invoicePaymentStatus', 'sendStatus']],
      ['payments', ['paymentDate', 'invoiceNumber', 'clientName', 'amount', 'paymentMethod', 'receivingAccount', 'reference', 'status']],
    ] as const) for (const sort of sorts) {
      const filters = { sort, order: 'asc', from: '2026-10-01', to: '2026-10-28', min: 10, max: 100, pageSize: 5, page: 2 }
      const query = kind === 'quotes' ? quoteListQuery('nonexistent-test-company', filters)
        : invoiceListQuery(['nonexistent-test-company'], filters, kind === 'payments')
      const { rows } = await db.query(query.sql, query.values)
      assert.deepEqual(rows[0].rows, [])
      assert.equal(Number(rows[0].total), 0)
      assert.equal(Number(rows[0].summary.amount), 0)
    }
    await db.query('ROLLBACK')
  } finally { await db.end() }
})
