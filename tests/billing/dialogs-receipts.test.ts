import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref, reactive } from 'vue'
import { harness, billing, edit, row, plain, pageState } from './harness'

for (const mode of ['success', 'missing name', 'server failure']) test(`add account: ${mode}`, async t => {
  const requests: any[] = [], emitted: any[] = [], toasts: any[] = []
  const h = harness('components/Billing/AccountModal.vue', ['submitForm'], { ...pageState(), account: ref({ name: mode === 'missing name' ? '' : 'Shop', phone: '9876543210', city: 'Kochi' }), open: ref(true), isSaving: ref(false), emit: (...args: any[]) => emitted.push(args), toast: { add: (value: any) => toasts.push(value) }, $fetch: async (url: string, options: any) => { requests.push({url,...options}); if (mode === 'server failure') throw new TypeError('Failed to fetch') } }); t.after(h.stop)
  await h.context.submitForm(); assert.equal(h.context.isSaving.value, false)
  if (mode === 'success') { assert.equal(requests[0].body.companyId, 'company'); assert.equal(requests[0].body.address.city, 'Kochi'); assert.equal(h.context.open.value, false); assert.deepEqual(emitted, [['account-created']]) }
  else { assert.equal(h.context.open.value, true); assert.equal(toasts.at(-1).color, 'red'); assert.match(toasts.at(-1).description, mode === 'missing name' ? /fill name/ : /internet connection/) }
})
for (const mode of ['new', 'linked', 'unlinked', 'duplicate phone', 'failure']) test(`add client: ${mode}`, async t => {
  const created: any[] = [], updated: any[] = [], callbacks: any[] = [], toasts: any[] = [], requests: any[] = []
  const existing = { id: 'existing', name: 'Alice', companies: mode === 'linked' ? [{ companyId: 'company' }] : [] }
  let lookups = 0
  const h = harness('components/Billing/AddClient.vue', ['normalizePhoneDigits', 'phoneDigits', 'isValidPhone', 'currentCompanyId', 'isUniquePhoneError', 'linkClientToCompany', 'login'], {
    ...pageState(), form: reactive({ phone: '+91 98765 43210', name: 'Alice', email: 'test@example.invalid' }), model: ref(true), props: { clientAdded: (...args: any[]) => callbacks.push(args) },
    toast: { add: (value: any) => toasts.push(value) }, uuidv4: () => 'new-client',
    getExistingClient: async () => { lookups++; return mode === 'new' || mode === 'failure' || (mode === 'duplicate phone' && lookups === 1) ? null : existing },
    CreateClient: { mutateAsync: async (payload: any) => { created.push(payload); if (mode === 'failure') throw new Error('Prisma SQL constraint failed'); if (mode === 'duplicate phone') throw { code: 'P2002' } } },
    UpdateClient: { mutateAsync: async (payload: any) => updated.push(payload) },
    $fetch: async (url: string, options: any) => { requests.push({url,...options}); assert.equal(url, '/api/counter/increment'); return { number: 1 } },
  }); t.after(h.stop)
  await h.context.login(); assert.equal(h.context.isSaving.value, false)
  if (mode === 'failure') { assert.equal(h.context.model.value, true); assert.match(toasts.at(-1).description, /Unable to add the client/); assert.equal(callbacks.length, 0) }
  else { assert.equal(h.context.model.value, false); assert.equal(callbacks[0][2], '9876543210'); assert.equal(toasts.at(-1).color, 'green') }
  if (mode === 'new') { assert.equal(created[0].data.phone, '+919876543210'); assert.equal(created[0].data.companies.create.company.connect.id, 'company') }
  if (mode === 'linked') { assert.equal(updated.length, 0); assert.equal(requests.length, 0) }
  if (mode === 'unlinked' || mode === 'duplicate phone') assert.equal(updated[0].where.id, 'existing')
})
test('product dialog selection emits selected barcodes and resets filters', t => {
  const emitted: any[] = []
  const h = harness('components/Billing/ProductSearch.vue', ['allItems', 'toggleItem', 'clearAll', 'done'], { variants: ref([{ id: 'variant', sprice: 100, name: 'Blue', product: { name: 'Shirt' }, items: [{ id: 'one', barcode: 'A' }, { id: 'two', barcode: 'B' }] }]), selectedItems: ref([]), selectedCategory: ref('cat'), selectedSubcategory: ref('sub'), selectedProduct: ref('product'), expandedRow: ref('variant'), emit: (...args: any[]) => emitted.push(args) }); t.after(h.stop)
  h.context.toggleItem('one'); h.context.toggleItem('two'); h.context.toggleItem('two'); h.context.done()
  assert.deepEqual(plain(emitted), [['done', [{ barcode: 'A' }]], ['close']]); assert.equal(h.context.selectedItems.value.length, 0); assert.equal(h.context.selectedCategory.value, null)
})
test('sales return dialog emits populated rows and closes', t => {
  const emitted: any[] = []
  const h = harness('components/Billing/SalesReturn.vue', ['sendReturnValue'], { returnedItems: ref([row({ return: true }), row({ name: '', barcode: '', category: [] })]), model: ref(true), emit: (...args: any[]) => emitted.push(args) }); t.after(h.stop)
  h.context.sendReturnValue(); assert.equal(emitted[0][0], 'totalreturnvalue'); assert.equal(emitted[0][1].returnedItems.length, 1); assert.equal(h.context.model.value, false)
})
for (const file of [billing, edit]) {
  for (const fails of [false, true]) test(`${file}: receipt print ${fails ? 'failure' : 'success'}`, async t => {
    const toasts: any[] = []
    const h = harness(file, ['print'], { printData: { invoiceNumber: 1 }, printModel: ref(true), printBill: async () => { if (fails) throw new Error('Prisma SQL /api/printer') }, toast: { add: (value: any) => toasts.push(value) } }); t.after(h.stop)
    await h.context.print(); assert.equal(h.context.printModel.value, fails); assert.equal(toasts.at(-1).color, fails ? 'red' : 'green'); if (fails) assert.match(toasts.at(-1).description, /Check your printer/)
  })
  test(`${file}: receipt send requires phone and sends generated coupons`, async t => {
    const requests: any[] = [], toasts: any[] = []
    const h = harness(file, ['send'], { ...pageState(), printModel: ref(false), printData: { clientPhone: '', clientName: 'Alice', companyName: 'Shop', generatedCoupons: ['gift'] }, toast: { add: (value: any) => toasts.push(value) }, $fetch: async (url: string, options: any) => requests.push({url,...options}) }); t.after(h.stop)
    await h.context.send(); assert.equal(requests.length, 0); assert.match(toasts.at(-1).description, /phone number is missing/)
    h.context.printData.clientPhone = '9876543210'; await h.context.send(); assert.equal(requests.length, 2); assert.equal(requests[1].url, '/api/whatsapp/send-coupon-message'); assert.equal(toasts.at(-1).color, 'green')
  })
}
