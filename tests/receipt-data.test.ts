import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref } from 'vue'
import { harness, billing, plain } from './billing/harness'
import { invoiceBalance, isInvoice, billDocumentLines } from '../utils/invoice-flow'
import { receiptSummary } from '../utils/receipt-summary'

function fixture(overrides: Record<string, any> = {}) {
  return {
    id: 'bill', companyId: 'company', createdAt: '2026-10-29T05:00:00Z', invoiceNumber: 100,
    subtotal: 150, discount: 2, discountType: 'percentage', adjustment: 2, grandTotal: 114.4,
    redeemedPoints: 5, couponValue: 10, availablePoints: 80, showUnit: true,
    notes: 'Please call before delivery.', termsAndConditions: 'Keep this receipt.',
    paymentMethod: 'Credit', paymentStatus: 'PENDING', invoiceCode: 'INV-100', type: 'BILL',
    dueDate: '2026-11-28', invoicePaymentTerms: 'Net 30', subject: 'Clothing order',
    payments: [{ amount: 40, status: 'POS_CREDIT_RECEIPT', deleted: false }],
    generatedCoupons: [{ id: 'voucher', code: 'SAMPLE50', discountValue: 50, type: 'FLAT' }],
    client: { name: 'Sample Customer', phone: '9999999999' },
    company: { companyName: 'Sample Store', isTaxIncluded: true, address: { city: 'Kochi' } },
    entries: [
      { name: 'Shirt', barcode: 'A1', category: 'Clothing', qty: 2, rate: 100, value: 180, discount: 10, tax: 5, size: 'M', unit: 'Nos', return: false },
      { name: 'Returned item', barcode: 'A2', category: 'Clothing', qty: 1, rate: 50, value: 50, discount: 0, tax: 5, size: 'L', unit: 'Nos', return: true },
    ], ...overrides,
  }
}

async function readSaved(t: any, sale: any) {
  const calls: any[] = []; let released = false
  const h = harness('server/utils/receiptData.ts', ['readReceiptData'], {
    pool: { connect: async () => ({ query: async (sql: string, values: any[]) => { calls.push({ sql, values }); return { rows: [sale] } }, release: () => { released = true } }) },
    readPrintSettings: async () => ({}), activeTemplate: () => null, invoiceBalance, isInvoice,
  }); t.after(h.stop)
  const data = await h.context.readReceiptData('bill', ['company'])
  assert.equal(released, true)
  assert.deepEqual(plain(calls[0].values), ['bill', ['company']])
  assert.match(calls[0].sql, /b\.company_id = ANY\(\$2::text\[\]\)/)
  assert.match(calls[0].sql, /cp\.company_id=b\.company_id/)
  assert.doesNotMatch(calls[0].sql, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER)\b/)
  return data
}

test('saved invoice reprints retain adjustments, returns, sizes, units, redemption and invoice details', async t => {
  const sale = fixture(), data = await readSaved(t, sale)
  assert.equal(data.adjustment, 2); assert.equal(data.couponValue, 10); assert.equal(data.redeemedPoints, 5)
  assert.equal(data.availablePoints, 80); assert.equal(data.showUnit, true)
  assert.equal(data.entries[0].size, 'M'); assert.equal(data.entries[1].qty, -1)
  assert.equal(data.entries[1].tvalue, -50)
  assert.equal(data.tqty, 1); assert.equal(data.tvalue, 150); assert.equal(data.ttvalue, 130); assert.equal(data.tdiscount, 20)
  assert.equal(data.balanceDue, 74.4); assert.equal(data.amountReceived, 40)
  assert.equal(data.invoicePaymentStatus, 'Partially paid')
  assert.deepEqual(plain(data.generatedCoupons), sale.generatedCoupons)
  const lines = plain(billDocumentLines(data))
  for (const line of ['Subject: Clothing order', 'Payment terms: Net 30', 'Due date: 2026-11-28', 'Customer notes: Please call before delivery.', 'Terms and conditions: Keep this receipt.']) assert.ok(lines.includes(line), line)
  assert.equal(receiptSummary(data).discountText, '-0.60')
  assert.ok(Math.abs(receiptSummary(data).savings - 35.6) < 0.001)

  const h = harness(billing, ['buildPrintData']); t.after(h.stop)
  const state = { subtotal: 150, discount: 2, adjustment: 2, grandTotal: 114.4, paymentMethod: 'Credit', splitPayments: [], clientName: sale.client.name, phoneNo: sale.client.phone, date: sale.createdAt, points: 80, redeemedPoints: 5, couponValue: 10, customerNotes: sale.notes, termsAndConditions: sale.termsAndConditions }
  const immediate = h.context.buildPrintData({ billInv: 100, session: { companyId: 'company', variantInputs: { unit: ['Nos', 'Kg'] } }, finalitems: sale.entries.map(entry => ({ ...entry, category: [{ name: entry.category }] })), refs: Object.fromEntries(Object.entries(state).map(([key, value]) => [key, ref(value)])) })
  for (const field of ['adjustment','grandTotal','couponValue','redeemedPoints','availablePoints','showUnit','notes','termsAndConditions','tqty','tvalue','ttvalue','tdiscount']) assert.deepEqual(immediate[field], data[field], field)
  for (const field of ['qty','value','tvalue','return','size','unit','discount','description']) assert.deepEqual(plain(immediate.entries.map((entry: any) => entry[field])), plain(data.entries.map((entry: any) => entry[field])), field)
})

test('legacy surcharge and flat deductions retain their receipt meaning on reprint', async t => {
  for (const [discountType, discount, expected] of [['surcharge', 2, '+2'], ['flat', -2, -2]] as const) {
    const data = await readSaved(t, fixture({ discountType, discount, adjustment: null, showUnit: false }))
    assert.equal(data.discount, expected); assert.equal(data.adjustment, 0); assert.equal(data.showUnit, false)
  }
})
