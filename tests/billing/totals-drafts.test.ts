import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick } from 'vue'
import { composable, harness, edit, row, plain } from './harness'

for (const [discount, expected] of [[0, 200], [10, 180], [-5, 195], ['+50', 250], ['', 200], ['bad', 200]] as const) {
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
  d.items.value = [row()]; d.discount.value = '+20'; await nextTick()
  assert.equal(JSON.parse(h.storage.get(d.LOCAL_BILLS_KEY)!).at(0).discount, '+20')
  assert.equal(d.createNewBill(), true); await nextTick()
  assert.equal(d.billNo.value, '2'); assert.equal(d.items.value[0].name, '')
  d.loadBill('1'); await nextTick(); assert.equal(d.discount.value, '+20')
  for (let i = 0; i < 3; i++) { assert.equal(d.createNewBill(), true); await nextTick() }
  assert.equal(d.createNewBill(), false); assert.equal(d.draftBills.value.length, 5)
  d.deleteBill('2'); await nextTick(); assert.deepEqual(plain(d.draftBills.value.map((x: any) => x.billNo)), ['1', '2', '3', '4'])
  d.resetDraft(); await nextTick(); assert.equal(d.items.value.length, 1); assert.equal(d.clientId.value, ''); assert.equal(d.discount.value, 0)
})
test('draft storage is isolated by company', t => {
  const a = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(a.stop)
  const b = composable('composables/useBillingDraft.ts', 'useBillingDraft', [], { useCompanyScope: () => ({ companyId: { value: 'branch' }, fetch() {} }) }); t.after(b.stop)
  assert.notEqual(a.result.LOCAL_BILLS_KEY, b.result.LOCAL_BILLS_KEY)
})
test('incomplete date snaps back; complete date commits', async t => {
  const h = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(h.stop)
  const d = h.result, before = d.date.value
  d.dateInput.value = ''; d.commitDateInput(); assert.equal(d.date.value, before)
  d.dateInput.value = '2026-09-15'; d.commitDateInput(); await nextTick(); assert.equal(d.dateInput.value, '2026-09-15')
})
