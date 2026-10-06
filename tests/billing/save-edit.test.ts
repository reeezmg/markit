import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref } from 'vue'
import { harness, billing, edit, pageState, row, plain, deferred } from './harness'

function setup(page: string, overrides: any = {}) {
  const requests: any[] = [], toasts: any[] = [], actions: string[] = []
  const state = pageState({ toast: { add: (x: any) => toasts.push(x) }, reset: () => actions.push('reset'), print: () => actions.push('print'), send: () => actions.push('send'), download: () => actions.push('download'),
    $fetch: async (url: string, options: any) => {
      requests.push({ url, ...options })
      if (url === '/api/bill/create') return { billId: 'saved', invoiceNumber: 100, generatedCoupons: ['gift'] }
      if (url === '/api/bill/update') return { generatedCoupons: ['gift'] }
      if (url === '/api/billEdit/findEntriesToDelete') return ['deleted-entry']
      if (url === '/api/bill/findUniqueClient') return { id: 'client' }
      throw new Error('Unmocked request: ' + url)
    }, ...overrides })
  const names = page === 'billing' ? ['validateBillEntries', 'validateBillState', 'buildEntriesData', 'computeBillPoints', 'parseCreditParty', 'buildBillPayload', 'buildPrintData', 'ensureClientExists', 'handleSave'] : ['parseCreditParty', 'fetchEntriesToDelete', 'handleEdit']
  const h = harness(page === 'billing' ? billing : edit, names, { ...state, ...(page === 'edit' && { computeBillPoints: (total: number) => Math.round(total / 10) }) })
  return { ...h, state: h.context, requests, toasts, actions, save: () => page === 'billing' ? h.context.handleSave() : h.context.handleEdit() }
}

for (const page of ['billing', 'edit']) {
  for (const [method, credit] of [['Cash', false], ['UPI', false], ['Card', false], ['Credit', true], ['Split', true]] as const) test(`${page}: ${method} save payload and completion`, async t => {
    const h = setup(page); t.after(h.stop)
    h.state.paymentMethod.value = method
    h.state.splitPayments.value = [{ method: 'Cash', amount: 50 }, { method: 'Credit', amount: 50 }]
    h.state.selected.value = 'account:account-id'; h.state.clientId.value = 'client'; h.state.phoneNo.value = '9876543210'
    h.state.items.value[0].entryId = 'retained-entry'
    await h.save()
    assert.equal(h.toasts.at(-1)?.color, 'green', JSON.stringify(h.toasts))
    const req = h.requests.find(r => r.url === (page === 'billing' ? '/api/bill/create' : '/api/bill/update'))
    assert.ok(req)
    const payload = page === 'billing' ? req.body.payload : req.body.billData
    assert.equal(payload.paymentStatus, credit ? 'PENDING' : 'PAID'); assert.equal(payload.companyId || payload.company.connect.id, 'company')
    assert.equal(req.body.items.length, 1); assert.equal(h.state.isSaving.value, false)
    assert.equal(h.state.printData.invoiceNumber, page === 'billing' ? 100 : 92)
    assert.deepEqual(plain(h.state.printData.generatedCoupons), ['gift'])
    if (page === 'billing') { assert.equal(payload.entries.create[0].category.connect.id, 'cat'); assert.equal(h.storage.get('recent'), 'saved'); assert.deepEqual(h.actions, ['reset']) }
    else { assert.deepEqual(plain(req.body.entriesToDelete), ['deleted-entry']); assert.equal(h.state.pastBillPoints.value, 10) }
  })
  const invalidCases: [string, any, RegExp][] = [
    ['empty', { items: ref([row({ name: '', category: [], barcode: '' })]) }, /at least one|No valid/],
    ['category', { items: ref([row({ category: [] })]) }, /category/],
    ['zero quantity', { items: ref([row({ qty: 0 })]) }, /qty.*greater/],
    ['negative rate', { items: ref([row({ rate: -1 })]) }, /rate.*negative/],
    ['NaN quantity', { items: ref([row({ qty: 'bad' })]) }, /qty.*valid/],
    ['infinite rate', { items: ref([row({ rate: Infinity })]) }, /rate.*valid/],
    ['total', { grandTotal: ref(NaN) }, /total.*invalid/],
    ['infinite total', { grandTotal: ref(Infinity) }, /total.*invalid/],
    ['loading', { currentRequestIds: ref({ 0: Symbol('loading') }) }, /finish loading/],
    ['payment', { paymentMethod: ref('') }, /payment method/],
    ['split', { paymentMethod: ref('Split') }, /split payment/],
    ['date', { date: ref('invalid') }, /date.*invalid/],
    ['offline', { navigator: { onLine: false } }, /No internet/],
  ]
  for (const [name, overrides, message] of invalidCases) test(`${page}: reject ${name} before any request`, async t => {
    const h = setup(page, overrides); t.after(h.stop); await h.save()
    assert.equal(h.requests.length, 0); assert.equal(h.toasts.at(-1)?.color, 'red'); assert.match(h.toasts.at(-1)?.description, message); assert.equal(h.state.isSaving.value, false)
  })
  for (const action of ['print', 'send', 'download']) test(`${page}: selected ${action} runs after save`, async t => {
    const h = setup(page, { selectedAction: ref(action) }); t.after(h.stop); await h.save()
    assert.equal(h.actions[0], action); assert.equal(h.toasts.at(-1)?.color, 'green')
  })
  test(`${page}: double submission sends one write`, async t => {
    const pending = deferred(), writes: string[] = []
    const h = setup(page, { $fetch: async (url: string) => { if (url.endsWith('findEntriesToDelete')) return []; writes.push(url); return pending.promise } }); t.after(h.stop)
    const first = h.save(); await Promise.resolve(); await Promise.resolve(); const second = h.save()
    pending.resolve({ invoiceNumber: 1 }); await Promise.all([first, second]); assert.equal(writes.length, 1)
  })
  test(`${page}: server failure retains inputs and hides technical text`, async t => {
    const h = setup(page, { $fetch: async () => { throw { statusCode: 500, message: 'Prisma SQL constraint violation /api/bill/create' } } }); t.after(h.stop)
    await h.save(); assert.equal(h.state.items.value[0].name, 'Manual item'); assert.equal(h.state.isSaving.value, false)
    assert.match(h.toasts.at(-1).description, /Unable to (save|update)/); assert.equal(h.actions.length, 0)
  })
}
test('creation retry preserves request UUID and manual category/staff links', async t => {
  const h = setup('billing', { uuid: ref('existing-request') }); t.after(h.stop)
  h.state.items.value[0].userId = 'salesperson'; h.state.items.value[0].user = 'Alice'
  await h.save(); const body = h.requests.find(r => r.url.endsWith('/create')).body
  assert.equal(body.uuid, 'existing-request'); assert.equal(body.payload.entries.create[0].companyUser.connect.companyId_userId.userId, 'salesperson')
  assert.equal(body.payload.entries.create[0].category.connect.id, 'cat')
})
for (const page of ['billing', 'edit']) for (const [discount, type, value] of [[10, 'percentage', 10], [-5, 'flat', -5], ['+50', 'surcharge', 50]] as const) test(`${page}: persists ${type} discount`, async t => {
  const h = setup(page, { discount: ref(discount) }); t.after(h.stop); await h.save()
  const body = h.requests.find(r => r.url === (page === 'billing' ? '/api/bill/create' : '/api/bill/update')).body
  const payload = body.payload || body.billData
  assert.equal(payload.discountType, type); assert.equal(payload.discount, value)
})
test('edit deletion passes current bill and company and navigates only on success', async t => {
  const requests: any[] = [], navigation: string[] = []
  const h = harness(edit, ['handleDeleteBill'], { ...pageState(), $fetch: async (_url: string, options: any) => requests.push(options.body), router: { push: (path: string) => navigation.push(path) } }); t.after(h.stop)
  await h.context.handleDeleteBill(); assert.deepEqual(plain(requests[0]), { billId: 'test-bill', companyId: 'company' }); assert.deepEqual(navigation, ['/erp/sales'])
})
