import assert from 'node:assert/strict'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { deferred, harness, read } from './billing/harness'

const file = 'pages/erp/sales.vue'
const { descriptor, errors } = parse(read(file), { filename: file })
assert.deepEqual(errors, [])
compileScript(descriptor, { id: 'sales' })
assert.deepEqual(compileTemplate({ source: descriptor.template!.content, filename: file, id: 'sales' }).errors, [])

const pending: ReturnType<typeof deferred>[] = []
const h = harness(file, ['isLoading', 'lastFetchId', 'salesTotals', 'collectionsTotal', 'fetchSales'], {
  $fetch: async () => { const request = deferred(); pending.push(request); return request.promise },
  useAuth: () => ({ session: { value: { companyId: 'store' } } }),
  search: { value: 'older invoice' }, selectedStatus: { value: [] }, selectedPaymentMethods: { value: [] },
  minGrandTotal: { value: null }, maxGrandTotal: { value: null },
  getUtcDateRangeForApi: () => ({ startDate: '2026-10-05', endDate: '2026-10-05' }),
  page: { value: 1 }, pageCount: { value: 5 }, sort: { value: { column: 'createdAt', direction: 'desc' } },
  canUseCleanupToggle: { value: false }, showCleanedValues: { value: false },
  sales: { value: [] }, pageTotal: { value: 0 },
})
try {
  const c = h.context
  const first = c.fetchSales(), second = c.fetchSales()
  pending[1].resolve({ rows: [], total: 0, totals: { total: 0 }, collections: { total: 400 } })
  await second
  assert.equal(c.collectionsTotal.value, 400, 'Older invoice repayment is visible even without new sales')
  assert.equal(c.salesTotals.value.total, 0, 'Collections do not increase sales')
  pending[0].resolve({ rows: [], total: 0, collections: { total: 999 } })
  await first
  assert.equal(c.collectionsTotal.value, 400, 'Stale responses cannot replace the selected-date total')
  const failed = c.fetchSales()
  assert.equal(c.isLoading.value, true)
  pending[2].reject(new Error('Request failed'))
  await failed
  assert.equal(c.collectionsTotal.value, null, 'Failure clears the previous total')
  assert.equal(c.isLoading.value, false)
  console.log('Sales Vue compilation and collections loading, stale response, failure and separate sales checks passed')
} finally { h.stop() }
