import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref, nextTick } from 'vue'
import { composable, harness, edit, row, item, deferred, plain } from './harness'

function setup(overrides = {}, tax: any = { taxType: 'FIXED', fixedTax: 5 }) {
  const items = ref([row({ name: '', category: [], rate: 0, value: 0 })]), categories = ref([{ id: 'cat', name: 'Tops' }]), included = ref(true)
  const h = composable('composables/useBillingItems.ts', 'useBillingItems', [items, categories, { getCategoryById: () => tax }, included, { code: ref('A'), id: ref('staff'), name: ref('Alice') }, () => {}], overrides)
  return { ...h, items, included }
}
for (const [discount, included, expected] of [[0, true, 200], [10, true, 180], [-10, true, 180], [0, false, 210]] as const) test(`row calculations discount=${discount}, taxIncluded=${included}`, async t => {
  const h = setup(); t.after(h.stop); h.included.value = included
  h.items.value = [row({ qty: 2, discount })]; await nextTick()
  assert.equal(h.items.value[0].value, expected); assert.equal(h.items.value[0].tax, 5)
})
test('subcategory tax takes priority and last category wins', async t => {
  const h = setup(); t.after(h.stop)
  h.items.value = [row({ category: [{ id: 'old' }, { id: 'cat' }], _subcategory: { taxType: 'FIXED', fixedTax: 12 } })]; await nextTick()
  assert.equal(h.items.value[0].category.length, 1); assert.equal(h.items.value[0].tax, 12)
})
test('variable tax below and above threshold', async t => {
  const h = setup({}, { taxType: 'VARIABLE', thresholdAmount: 1000, taxBelowThreshold: 5, taxAboveThreshold: 12 }); t.after(h.stop)
  h.items.value = [row({ rate: 1000, value: 1000 })]; await nextTick(); assert.equal(h.items.value[0].tax, 5)
  h.items.value[0].rate = 1100; h.items.value[0].value = 1100; await nextTick(); assert.equal(h.items.value[0].tax, 12)
})
test('row creation retains staff, keeps category array, avoids duplicate blank rows', async t => {
  const h = setup(); t.after(h.stop)
  await h.result.addNewRow(0); assert.equal(h.items.value.length, 1)
  h.items.value[0].name = 'Item'; await h.result.addNewRow(0)
  assert.equal(h.items.value.length, 2); assert.equal(h.items.value[1].userId, 'staff'); assert.ok(Array.isArray(h.items.value[1].category))
})
test('backspace removes only empty fields and preserves at least one row', async t => {
  const h = setup(); t.after(h.stop); h.items.value = [row(), row()]
  let prevented = false
  h.result.removeRow({ target: { value: 'text' } }, 1, () => {}); assert.equal(h.items.value.length, 2)
  h.result.removeRow({ target: { value: '' }, preventDefault() { prevented = true } }, 1, () => {})
  assert.equal(h.items.value.length, 1); assert.equal(prevented, true)
  h.result.removeRow({ target: { value: '' }, preventDefault() {} }, 0, () => {}); assert.equal(h.items.value.length, 1)
})
test('barcode resolves category, price, cost, variant, size and zero stock', async t => {
  const h = setup({ $fetch: async () => item() }); t.after(h.stop)
  await h.result.fetchItemData('1A123456', 0)
  const r = h.items.value[0]
  assert.equal(r.category[0].id, 'cat'); assert.equal(r.rate, 100); assert.equal(r.cost, 40); assert.equal(r.size, 'M'); assert.equal(r.variantId, 'variant-1A123456'); assert.equal(r.totalQty, 0)
  assert.equal(h.result.loadingStates.value[0], false); assert.deepEqual(plain(h.result.currentRequestIds.value), {})
})
test('unknown barcode clears input with a meaningful toast', async t => {
  const h = setup({ $fetch: async () => null }); t.after(h.stop)
  h.items.value[0].barcode = 'bad'; await h.result.fetchItemData('bad', 0)
  assert.equal(h.items.value[0].barcode, ''); assert.match(h.toasts.at(-1).title, /Barcode/)
})
for (const page of ['billing', 'edit']) for (const sameBarcode of [false, true]) test(`${page}: older ${sameBarcode ? 'same' : 'different'} barcode response cannot clear or overwrite newer request`, async t => {
  const first = deferred(), second = deferred()
  let calls = 0
  const fetch = async () => ++calls === 1 ? first.promise : second.promise
  let h: any
  if (page === 'billing') h = setup({ $fetch: fetch })
  else {
    h = harness(edit, ['fetchItemFromServer', 'fetchItemData', 'processItemResponse', 'handleInvalidBarcode'], { $fetch: fetch, items: ref([row()]), categories: ref([{ id: 'cat' }]), loadingStates: ref([]), currentRequestIds: ref({}), toast: { add() {} } })
    h.result = h.context; h.items = h.context.items
  }
  t.after(h.stop)
  const a = h.result.fetchItemData('first', 0), b = h.result.fetchItemData(sameBarcode ? 'first' : 'second', 0)
  first.resolve(item('first')); await a
  assert.equal(typeof h.result.currentRequestIds.value[0], 'symbol'); assert.equal(h.result.loadingStates.value[0], true)
  second.resolve(item('second')); await b
  assert.equal(h.items.value[0].id, 'second'); assert.equal(h.result.loadingStates.value[0], false)
})
test('product search adds all selected items and leaves one blank row', async t => {
  const h = setup({ $fetch: async (_url: string, options: any) => item(options.query.barcode) }); t.after(h.stop)
  await h.result.handleProductSelected([{ barcode: 'one' }, {}, { barcode: 'two' }]); await nextTick()
  assert.deepEqual(plain(h.items.value.map((r: any) => r.barcode)), ['one', 'two', ''])
})
test('returns replace blank rows, preserve sale and append a fresh row', async t => {
  const h = setup(); t.after(h.stop); h.items.value = [row(), row({ name: '', category: [] })]
  h.result.handleReturnData({ returnedItems: [row({ return: true })] }); await nextTick()
  assert.equal(h.items.value.length, 3); assert.equal(h.items.value[1].return, true); assert.equal(h.items.value[1].sn, 2)
})
