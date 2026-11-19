import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick } from 'vue'
import { composable, harness, edit, row, plain } from './harness'
import { billDiscountValue, billAdjustmentValue, splitBillDiscount } from '../../utils/bill-adjustments'
import { receiptSummary } from '../../utils/receipt-summary'

for (const [discount, expected] of [[0, 200], [10, 180], [-5, 195], ['+50', 200], ['', 200], ['bad', 200]] as const) {
  for (const page of ['billing', 'edit']) test(`${page}: total with discount ${JSON.stringify(discount)}`, async t => {
    const h = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(h.stop)
    const d = h.result
    d.items.value = [row({ qty: 2, value: 200 })]; d.discount.value = discount
    if (page === 'billing') assert.equal(d.grandTotal.value, expected)
    else {
      const e = harness(edit, ['grandTotal'], d); t.after(e.stop)
      assert.equal(e.context.grandTotal.value, expected)
    }
  })
}
test('returns and redeemed amount reduce totals, blank row does not count', t => {
  const h = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(h.stop)
  const d = h.result
  d.items.value = [row({ qty: 3, value: 300 }), row({ qty: 1, return: true, value: 100 }), row({ name: '', category: [], rate: 0, value: 0 })]
  d.redeemedAmt.value = 20
  assert.equal(d.subtotal.value, 200); assert.equal(d.returnAmt.value, 100); assert.equal(d.grandTotal.value, 180); assert.equal(d.tQty.value, 4)
})
test('draft bootstrap, persistence, switching, limit, deletion, reset', async t => {
  const h = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(h.stop); await h.mount()
  const d = h.result
  assert.equal(d.draftBills.value.length, 1)
  d.items.value = [row()]; d.discount.value = -5; d.adjustment.value = 20; d.customerNotes.value = 'Customer note'; d.termsAndConditions.value = 'Receipt terms'; await nextTick()
  assert.equal(JSON.parse(h.storage.get(d.LOCAL_BILLS_KEY)!).at(0).discount, -5)
  assert.equal(JSON.parse(h.storage.get(d.LOCAL_BILLS_KEY)!).at(0).adjustment, 20)
  assert.equal(d.createNewBill(), true); await nextTick()
  assert.equal(d.billNo.value, '2'); assert.equal(d.items.value[0].name, '')
  d.loadBill('1'); await nextTick(); assert.equal(d.discount.value, -5); assert.equal(d.adjustment.value, 20)
  assert.equal(d.customerNotes.value, 'Customer note'); assert.equal(d.termsAndConditions.value, 'Receipt terms')
  for (let i = 0; i < 3; i++) { assert.equal(d.createNewBill(), true); await nextTick() }
  assert.equal(d.createNewBill(), false); assert.equal(d.draftBills.value.length, 5)
  d.deleteBill('2'); await nextTick(); assert.deepEqual(plain(d.draftBills.value.map((x: any) => x.billNo)), ['1', '2', '3', '4'])
  d.resetDraft(); await nextTick(); assert.equal(d.items.value.length, 1); assert.equal(d.clientId.value, ''); assert.equal(d.discount.value, 0)
  assert.equal(d.adjustment.value, 0)
  assert.equal(d.customerNotes.value, ''); assert.equal(d.termsAndConditions.value, '')
})
test('discount and signed adjustment combine independently in billing and edit totals', t => {
  const h = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(h.stop)
  const d = h.result; d.items.value = [row({ rate: 200, value: 200 })]
  const e = harness(edit, ['grandTotal'], d); t.after(e.stop)
  for (const [discount, adjustment, expected] of [[2, 2, 198], [2, -2, 194], [-2, 2, 200], [-2, -2, 196], [0, 2, 202], [0, -2, 198], [2.5, 0.25, 195.25]]) {
    d.discount.value = discount; d.adjustment.value = adjustment
    assert.equal(d.grandTotal.value, expected); assert.equal(e.context.grandTotal.value, expected)
  }
  for (const value of ['+2', '2%', '2x', Infinity]) assert.throws(() => billDiscountValue(value), /Discount/)
  for (const value of ['2x', Infinity, '-']) assert.throws(() => billAdjustmentValue(value), /Adjustment/)
  assert.deepEqual(splitBillDiscount('+20', -2), { discount: 0, adjustment: 18 })
  assert.deepEqual(splitBillDiscount(20, -2, 'surcharge'), { discount: 0, adjustment: 18 })
  const summary = receiptSummary({ ttvalue: 200, discount: 2, adjustment: 2 })
  assert.equal(summary.discountText, '-2.00'); assert.equal(summary.savings, 2)
  assert.equal(receiptSummary({ ttvalue: 200, discount: 0, adjustment: 2 }).discountText, '+2.00')
})
test('legacy draft charges move into adjustment while preserving their total on reload', async t => {
  const h = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(h.stop); await h.mount()
  const d = h.result
  d.items.value = [row()]; d.discount.value = '+20'; await nextTick()
  d.loadBill('1'); await nextTick()
  assert.equal(d.discount.value, 0); assert.equal(d.adjustment.value, 20); assert.equal(d.grandTotal.value, 120)
})
test('draft storage is isolated by company', t => {
  const a = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(a.stop)
  const b = composable('composables/useBillingDraft.ts', 'useBillingDraft', [], { useCompanyScope: () => ({ companyId: { value: 'branch' }, fetch() {} }) }); t.after(b.stop)
  assert.notEqual(a.result.LOCAL_BILLS_KEY, b.result.LOCAL_BILLS_KEY)
})

test('billing mode preference survives new drafts, reset, draft switching and remount per company', async t => {
  const h = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(h.stop); await h.mount()
  const d = h.result
  d.billingMode.value = 'invoice'; await nextTick()
  assert.equal(h.storage.get('markit_billing_mode:company'), 'invoice')
  d.createNewBill(); await nextTick()
  assert.equal(d.billingMode.value, 'invoice'); assert.equal(d.paymentMethod.value, 'Credit')
  d.resetDraft(); await nextTick()
  assert.equal(d.billingMode.value, 'invoice'); assert.ok(d.dueDate.value)
  assert.equal(d.invoicePaymentTerms.value, 'Due on Receipt')
  d.billingMode.value = 'paynow'; await nextTick()
  d.loadBill('1'); await nextTick()
  assert.equal(d.billingMode.value, 'paynow'); assert.equal(d.paymentMethod.value, 'Cash')
  const reloaded = composable('composables/useBillingDraft.ts', 'useBillingDraft', [], { localStorage: h.context.localStorage }); t.after(reloaded.stop); await reloaded.mount()
  assert.equal(reloaded.result.billingMode.value, 'paynow')
  reloaded.result.billingMode.value = 'invoice'; await nextTick()
  const invoiceReload = composable('composables/useBillingDraft.ts', 'useBillingDraft', [], { localStorage: h.context.localStorage }); t.after(invoiceReload.stop); await invoiceReload.mount()
  assert.equal(invoiceReload.result.billingMode.value, 'invoice'); assert.equal(invoiceReload.result.paymentMethod.value, 'Credit')
  const branch = composable('composables/useBillingDraft.ts', 'useBillingDraft', [], { localStorage: h.context.localStorage, useCompanyScope: () => ({ companyId: { value: 'branch' }, fetch() {} }) }); t.after(branch.stop); await branch.mount()
  assert.equal(branch.result.billingMode.value, 'paynow')
  assert.equal(h.storage.get('markit_billing_mode:company'), 'invoice')
})
test('incomplete date snaps back; complete date commits', async t => {
  const h = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(h.stop)
  const d = h.result, before = d.date.value
  d.dateInput.value = ''; d.commitDateInput(); assert.equal(d.date.value, before)
  d.dateInput.value = '2026-09-15'; d.commitDateInput(); await nextTick(); assert.equal(d.dateInput.value, '2026-09-15')
})
