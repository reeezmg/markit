import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref, nextTick } from 'vue'
import { harness, billing, edit, row, plain, pageState, composable } from './harness'

for (const file of [billing, edit]) {
  test(`${file}: barcode/category shortcuts and keyboard focus flow`, async t => {
    const focused: string[] = [], fetched: any[] = [], added: number[] = []
    const control = (name: string) => ({ $el: { querySelector: () => ({ focus: () => focused.push(name), select: () => focused.push(name + '-select') }), focus: () => focused.push(name) } })
    const h = harness(file, ['handleEnterBarcode', 'handleEnterMainDiscount', 'handleEnterPayment'], { items: ref([row()]), categories: ref([{ id: 'cat' }]), categoryStore: { resolveShortCut: () => ({ category: { id: 'cat' }, subcategory: { id: 'sub', name: 'Tee' } }) }, discountref: ref(control('discount')), paymentref: ref(control('payment')), saveref: ref(control('save')), rateInputs: ref([control('rate')]), fetchItemData: (...args: any[]) => fetched.push(args), addNewRow: (index: number) => added.push(index) }); t.after(h.stop)
    h.context.handleEnterBarcode('', 0); assert.deepEqual(focused, ['discount', 'discount-select'])
    h.context.handleEnterBarcode('T', 0); assert.equal(h.context.items.value[0].category[0].id, 'cat'); assert.equal(h.context.items.value[0].name, 'Tee'); assert.equal(h.context.items.value[0].subcategoryId, 'sub')
    h.context.handleEnterBarcode('1A123456', 0); assert.deepEqual(fetched, [['1A123456', 0]]); assert.deepEqual(added, [0])
    h.context.handleEnterMainDiscount(); h.context.handleEnterPayment(); assert.deepEqual(focused.slice(-2), ['payment', 'save'])
  })
  test(`${file}: staff tracking applies to rows and can be cleared`, async t => {
    const h = harness(file, ['updateUserDetails', 'updateParentUserDetails'], { items: ref([row(), row()]), userStore: { getuserByCode: (code: any) => Number(code) === 1 ? { id: 'staff', name: 'Alice' } : null }, parentUserId: ref(null), parentUserCode: ref(null), parentUserName: ref(null), toast: { add() {} } }); t.after(h.stop)
    await h.context.updateUserDetails(0, 1); assert.equal(h.context.items.value[0].userId, 'staff')
    await h.context.updateParentUserDetails(1); assert.ok(h.context.items.value.every((x: any) => x.userId === 'staff'))
    await h.context.updateParentUserDetails(''); assert.ok(h.context.items.value.every((x: any) => x.userId === null))
  })
}
test('edit restores persisted categories, item IDs, credit party, surcharge and loyalty baseline', async t => {
  const state = pageState({ categories: ref([{ id: 'cat', name: 'Tops' }]), paymentOptions: ['Cash', 'UPI', 'Card', 'Credit'], tempSplits: ref({}), bill: ref(null), dataLoading: ref(false), clientFound: ref(false), couponFound: ref(false), isRedeemPoint: ref(false), baseDisplayPoints: ref(0), barcodeInputs: ref([]), resizableTable: ref(null) })
  const h = harness(edit, ['computeBillPoints', 'setDisplayedPointsFromServer', '$watch:bill'], { ...state, pointsValue: 10 }); t.after(h.stop)
  h.context.bill.value = { companyId: 'company', createdAt: '2026-10-06', grandTotal: 100, paymentMethod: 'Split', splitPayments: [{ method: 'Cash', amount: 50 }, { method: 'Credit', amount: 50 }], creditUserId: 'staff', discount: 10, discountType: 'surcharge', redeemedPoints: 20, couponValue: 5, client: { id: 'client', name: 'Alice', phone: '+919876543210', companies: [{ points: 100 }] }, entries: [{ id: 'entry', name: 'Tee', qty: 1, rate: 100, value: 100, categoryId: 'cat', item: { id: 'item', size: 'M' }, variant: { id: 'variant', pprice: 40 } }] }
  await new Promise(resolve => setImmediate(resolve)); await nextTick()
  assert.equal(h.context.items.value[0].category[0].id, 'cat'); assert.equal(h.context.items.value[0].entryId, 'entry'); assert.equal(h.context.items.value[0].id, 'item'); assert.equal(h.context.items.value.length, 2)
  assert.equal(h.context.discount.value, '+10'); assert.equal(h.context.selected.value, 'user:staff'); assert.equal(h.context.phoneNo.value, '9876543210'); assert.equal(h.context.redeemedAmt.value, 25)
  assert.equal(h.context.points.value, 90); assert.equal(h.context.splitPayments.value.length, 2); assert.equal(h.context.dataLoading.value, false)
})
for (const scan of ['1A123456', 'invalid', '']) test(`native scanner result ${JSON.stringify(scan)}`, async t => {
  const received: string[] = []
  const h = composable('composables/useBillingCamera.ts', 'useBillingCamera', [(value: string) => received.push(value)], { Capacitor: { isNativePlatform: () => true }, CapacitorBarcodeScanner: { scanBarcode: async () => ({ ScanResult: scan }) }, CapacitorBarcodeScannerTypeHint: { CODE_128: 1 }, Quagga: { stop() {}, offDetected() {} } }); t.after(h.stop)
  h.result.handleScan(); await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(received, scan === '1A123456' ? [scan] : [])
  if (scan === 'invalid') assert.match(h.toasts[0].title, /Invalid/)
})
test('web scanner dispatches barcode and stops detection', async t => {
  let detected: any, stopped = 0; const received: string[] = []
  const h = composable('composables/useBillingCamera.ts', 'useBillingCamera', [(value: string) => received.push(value)], { Capacitor: { isNativePlatform: () => false }, navigator: { permissions: { query: async () => ({ state: 'granted' }) } }, Quagga: { init: (_options: any, callback: any) => callback(null), start() {}, onDetected: (callback: any) => { detected = callback }, stop: () => stopped++, offDetected() {} } }); t.after(h.stop)
  h.result.handleScan(); await new Promise(resolve => setImmediate(resolve)); assert.equal(h.result.showCamera.value, true)
  detected({ codeResult: { code: '1A123456' } }); assert.deepEqual(received, ['1A123456']); assert.equal(h.result.showCamera.value, false); assert.equal(stopped, 1)
})
test('network item failure preserves typed barcode and gives connection guidance', async t => {
  const items = ref([row({ barcode: '1A123456' })])
  const h = composable('composables/useBillingItems.ts', 'useBillingItems', [items, ref([]), { getCategoryById() {} }, ref(true), { code: ref(null), id: ref(null), name: ref(null) }, () => {}], { $fetch: async () => { throw new TypeError('Failed to fetch') } }); t.after(h.stop)
  await h.result.fetchItemData('1A123456', 0); assert.equal(items.value[0].barcode, '1A123456'); assert.match(h.toasts.at(-1).description, /internet connection/); assert.deepEqual(plain(h.result.currentRequestIds.value), {})
})
