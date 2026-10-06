import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref, nextTick, toRaw } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { harness, composable, billing, edit, read, deferred, plain } from './harness'

test('edit waits for owner and categories before exposing bill; loading clears', async t => {
  const order: string[] = [], categories = deferred(), record = { companyId: 'branch', entries: [{ categoryId: 'cat' }] }
  const h = harness(edit, ['fetchBill'], { bill: ref(null), dataLoading: ref(false), route: { params: { salesId: 'bill' } }, useAuth: () => ({ session: ref({ companyId: 'company' }) }), $fetch: async () => { order.push('bill'); return record }, selectOwnerAndReload: async (id: string) => { order.push(id); return true }, getCategories: async () => { order.push('categories'); await categories.promise } }); t.after(h.stop)
  const pending = h.context.fetchBill(); await Promise.resolve(); await Promise.resolve()
  assert.equal(h.context.bill.value, null); assert.equal(h.context.dataLoading.value, true)
  categories.resolve([]); await pending
  assert.deepEqual(order, ['bill', 'branch', 'categories']); assert.equal(h.context.bill.value.entries[0].categoryId, 'cat'); assert.equal(h.context.dataLoading.value, false)
})
test('edit owner selection cancelled leaves previous bill unchanged', async t => {
  const h = harness(edit, ['fetchBill'], { bill: ref(null), dataLoading: ref(false), route: { params: {} }, useAuth: () => ({ session: ref({}) }), $fetch: async () => ({ companyId: 'branch' }), selectOwnerAndReload: async () => false, getCategories: async () => { throw new Error('Must not load categories') } }); t.after(h.stop)
  await h.context.fetchBill(); assert.equal(h.context.bill.value, null); assert.equal(h.context.dataLoading.value, false)
})
for (const file of [billing, edit, 'components/Billing/ProductSearch.vue', 'components/Billing/AddClient.vue', 'components/Billing/AccountModal.vue', 'components/Billing/SplitModal.vue', 'components/Billing/SalesReturn.vue']) test(`${file}: script and template compile`, () => {
  const { descriptor, errors } = parse(read(file)); assert.deepEqual(errors, [])
  const result = compileScript(descriptor, { id: 'billing-tests' })
  const template = compileTemplate({ source: descriptor.template!.content, filename: file, id: 'billing-tests', compilerOptions: { bindingMetadata: result.bindings } })
  assert.deepEqual(template.errors, [])
})
test('table minimum includes header + one row, toolbar/footer/borders; responds to resize and cleans up', async t => {
  let measure: any, disconnected = 0, rowHeight = 40
  const observed: any[] = []
  const block = (height: number) => ({ getBoundingClientRect: () => ({ height }) })
  const card = {}, body = { parentElement: card, previousElementSibling: block(50), nextElementSibling: block(200) }
  const container = { parentElement: body }, table = { tHead: block(30), tBodies: [{ rows: [{ getBoundingClientRect: () => ({ height: rowHeight }) }] }], parentElement: container }
  const tableRef = ref<any>(null)
  const h = composable('composables/useBillingTableLayout.ts', 'useBillingTableLayout', [tableRef], { getComputedStyle: (element: any) => toRaw(element) === card ? { borderTopWidth: '1', borderBottomWidth: '1' } : { paddingTop: '12', paddingBottom: '12' }, ResizeObserver: class { constructor(fn: any) { measure = fn } observe(el: any) { observed.push(el) } disconnect() { disconnected++ } } }); t.after(h.stop)
  tableRef.value = table; await nextTick()
  assert.deepEqual(plain(h.result.value), { '--billing-table-min-height': '95px', '--billing-card-min-height': '347px' }); assert.equal(observed.length, 4)
  rowHeight = 50; measure(); assert.equal(h.result.value['--billing-table-min-height'], '105px')
  tableRef.value = null; await nextTick(); assert.equal(disconnected, 1)
})
