import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref, computed, nextTick } from 'vue'
import { composable, harness, edit, row, plain, deferred } from './harness'

function client(fetch: any = async () => []) {
  const phone = ref(''), id = ref(''), name = ref(''), points = ref(0), redeemed = ref(0), redeemedPoints = ref(0), isRedeemed = ref(false), modal = ref(false)
  const h = composable('composables/useBillingClient.ts', 'useBillingClient', [phone, id, name, points, redeemed, redeemedPoints, isRedeemed, computed(() => 100 - redeemed.value), modal, () => {}], { $fetch: fetch })
  return { ...h, phone, id, name, points, redeemed, redeemedPoints, isRedeemed, modal }
}
for (const [matches, expected] of [[[], 'create'], [[{ id: 'one', name: 'Alice', phone: '+919876543210', points: 20 }], 'selected'], [[{ id: 'one', name: 'Alice' }, { id: 'two', name: 'Bob' }], 'ambiguous']] as const) test(`client lookup ${matches.length} matches => ${expected}`, async t => {
  const h = client(async () => matches); t.after(h.stop)
  assert.equal(await h.result.handleEnterPhone(), 'empty')
  h.phone.value = 'unknown'; await nextTick(); await Promise.resolve(); await nextTick()
  assert.equal(await h.result.handleEnterPhone(), expected)
  if (expected === 'selected') { assert.equal(h.id.value, 'one'); assert.equal(h.phone.value, '9876543210'); assert.equal(h.points.value, 20) }
  if (expected === 'create') assert.equal(h.modal.value, true)
})
test('client selection, adding, changing search and local redemption', async t => {
  const h = client(); t.after(h.stop)
  h.result.applySelectedClient({ id: 'client', name: 'Alice', phone: '9876543210', points: 150 }); await nextTick()
  await h.result.handleRedeemPoints(); assert.equal(h.redeemed.value, 100); assert.equal(h.points.value, 50); assert.equal(h.isRedeemed.value, true)
  await h.result.handleRedeemPoints(); assert.equal(h.redeemed.value, 0); assert.equal(h.points.value, 150)
  h.phone.value = 'Bob'; await nextTick(); assert.equal(h.id.value, ''); assert.equal(h.points.value, 0)
  h.modal.value = true; h.result.handleClientAdded('new', 'New', '+919876543210'); await nextTick()
  assert.equal(h.id.value, 'new'); assert.equal(h.phone.value, '9876543210'); assert.equal(h.modal.value, false)
})
test('client search ignores older results', async t => {
  const a = deferred(), b = deferred(); const h = client(async (_url: string, options: any) => options.query.q === 'A' ? a.promise : b.promise); t.after(h.stop)
  h.phone.value = 'A'; await nextTick(); h.phone.value = 'B'; await nextTick()
  a.resolve([{ id: 'old' }]); await Promise.resolve(); await nextTick(); assert.equal(h.result.isClientLoading.value, true)
  b.resolve([{ id: 'new' }]); await new Promise(resolve => setImmediate(resolve)); await nextTick(); assert.equal(h.result.clientMatches.value[0].id, 'new')
})

const coupon = (overrides = {}) => ({ id: 'coupon', code: 'SAVE', isActive: true, type: 'PERCENTAGE', discountValue: 10, startDate: '2000-01-01', endDate: '2099-12-31', usageLimit: null, perClientLimit: null, timesUsed: 0, audienceType: 'ALL', couponUsage: [], clients: [], ...overrides })
function coupons(list: any[]) {
  const id = ref('client'), items = ref([row()]), redeemed = ref(0), value = ref(0), base = ref(200)
  const h = composable('composables/useBillingCoupons.ts', 'useBillingCoupons', [id, items, computed(() => base.value - redeemed.value), redeemed, value], { $fetch: async () => list })
  return { ...h, id, items, redeemed, value, base }
}
const eligibilityCases: [string, any, number][] = [
  ['active', {}, 1], ['inactive', { isActive: false }, 0], ['not started', { startDate: '2099-01-01' }, 0], ['expired', { endDate: '2001-01-01' }, 0],
  ['minimum', { minOrderValue: 300 }, 0], ['global limit', { usageLimit: 1, timesUsed: 1 }, 0], ['client limit', { perClientLimit: 1, couponUsage: [{ clientId: 'client' }] }, 0],
  ['specific other', { audienceType: 'SPECIFIC', clients: [{ clientId: 'other' }] }, 0], ['specific selected', { audienceType: 'SPECIFIC', clients: [{ clientId: 'client' }] }, 1],
  ['generated empty', { audienceType: 'GENERATE', clients: [{ clientId: 'client', usageLimit: 0 }] }, 0], ['generated balance', { audienceType: 'GENERATE', clients: [{ clientId: 'client', usageLimit: 2 }] }, 1], ['private', { audienceType: 'PRIVATE' }, 0],
]
for (const [name, overrides, count] of eligibilityCases) test(`coupon eligibility: ${name}`, async t => {
  const h = coupons([coupon(overrides)]); t.after(h.stop); await h.result.couponRefetch(); await nextTick()
  assert.equal(h.result.eligibleCoupons.value.length, count)
})
for (const [name, overrides, expected] of [['percentage', {}, 20], ['cap', { discountValue: 50, maxDiscountAmount: 30 }, 30], ['flat', { type: 'FLAT', discountValue: 25 }, 25], ['cannot exceed order', { type: 'FLAT', discountValue: 500 }, 200], ['gift', { type: 'GIFT' }, 0]] as const) test(`coupon discount: ${name}, clear restores amount`, async t => {
  const h = coupons([coupon(overrides)]); t.after(h.stop); await h.result.couponRefetch()
  h.result.selectedCouponId.value = { value: 'coupon' }; await nextTick(); assert.equal(h.value.value, expected); assert.equal(h.redeemed.value, expected)
  h.result.selectedCouponId.value = null; await nextTick(); assert.equal(h.value.value, 0); assert.equal(h.redeemed.value, 0)
})
test('edit local redemption and undo preserve coupon and do not write to server', async t => {
  const h = harness(edit, ['resetRedeemState', 'handleRedeemPoints'], { clientId: ref('client'), points: ref(100), baseDisplayPoints: ref(100), skipPoints: ref(false), redeemedAmt: ref(20), redeemedPoints: ref(0), couponValue: ref(20), grandTotal: ref(80), isRedeemPoint: ref(false), redeeming: ref(false), toast: { add() {} } }); t.after(h.stop)
  await h.context.handleRedeemPoints(); assert.equal(h.context.redeemedAmt.value, 100); assert.equal(h.context.points.value, 20)
  await h.context.handleRedeemPoints(); assert.equal(h.context.redeemedAmt.value, 20); assert.equal(h.context.points.value, 100); assert.equal(h.calls.length, 0)
})
test('split confirmation emits only funded methods and rejects mismatched total', t => {
  const emitted: any[] = [], alerts: string[] = []
  const h = harness('components/Billing/SplitModal.vue', ['totalSplitAmount', 'submit'], { props: { grandTotal: 100 }, tempSplits: ref({ Cash: { method: 'Cash', amount: 40 }, Card: { method: 'Card', amount: 60 }, UPI: { method: 'UPI', amount: null } }), open: ref(true), emit: (...args: any[]) => emitted.push(args), alert: (message: string) => alerts.push(message) }); t.after(h.stop)
  h.context.submit(); assert.equal(h.context.open.value, false); assert.deepEqual(plain(emitted[0][1]), [{ method: 'Cash', amount: 40 }, { method: 'Card', amount: 60 }])
  h.context.tempSplits.value.Cash.amount = 30; h.context.submit(); assert.equal(alerts.length, 1); assert.equal(emitted.length, 1)
})
