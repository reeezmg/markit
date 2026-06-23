import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import crypto from 'crypto'
import {
  billLedgerRows,
  ensureAccountLedgerSchema,
  rebuildAccountLedgerForSource,
  type AccountLedgerRowInput,
} from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const { billId, companyId, status, paymentMethod } = await readBody(event)

  if (!billId || !companyId || !status) {
    throw createError({
      statusCode: 400,
      statusMessage: 'billId, companyId and status are required',
    })
  }

  const client = await pool.connect()

  try {
    await ensureAccountLedgerSchema(client)
    await client.query('BEGIN')

    const existingRes = await client.query(
      `
      SELECT invoice_number, payment_status, payment_method, split_payments, grand_total, created_at, is_markit, deleted
      FROM bills
      WHERE id = $1
        AND company_id = $2
        AND deleted = false
      FOR UPDATE
      `,
      [billId, companyId],
    )

    if (!existingRes.rowCount) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Bill not found or deleted',
      })
    }

    const existingBill = existingRes.rows[0]
    const res = await client.query(
      `
      UPDATE bills
      SET
        payment_status = $3::"PaymentStatus",
        payment_method = $4,
        updated_at = now()
      WHERE id = $1
        AND company_id = $2
        AND deleted = false
      RETURNING invoice_number, payment_status, payment_method, split_payments, grand_total, created_at, is_markit, deleted
      `,
      [
        billId,
        companyId,
        status, // string like 'PAID'
        status === 'PAID' ? paymentMethod : 'Credit',
      ]
    )

    if (!res.rowCount) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Bill not found or deleted',
      })
    }
    const bill = res.rows[0]
    const adjustmentRows = paymentMethodChangeRows(
      billId,
      companyId,
      existingBill,
      bill,
    )

    if (adjustmentRows.length) {
      const adjustmentSourceId = `${billId}:payment-change:${crypto.randomUUID()}`
      await rebuildAccountLedgerForSource(client, {
        companyId,
        sourceType: 'BILL',
        sourceId: adjustmentSourceId,
        rows: adjustmentRows.map(row => ({
          ...row,
          sourceId: adjustmentSourceId,
        })),
      })
    }
    await client.query('COMMIT')

    return {
      success: true,
      invoiceNumber: bill.invoice_number,
      paymentStatus: bill.payment_status,
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

function paymentMethodChangeRows(
  billId: string,
  companyId: string,
  oldBill: any,
  newBill: any,
) {
  const oldRows = billLedgerRows({
    id: billId,
    companyId,
    paymentMethod: oldBill.payment_method,
    paymentStatus: oldBill.payment_status,
    splitPayments: oldBill.split_payments,
    grandTotal: oldBill.grand_total,
    createdAt: oldBill.created_at,
    deleted: oldBill.deleted,
    isMarkit: oldBill.is_markit,
    invoiceNumber: oldBill.invoice_number,
  })

  const newRows = billLedgerRows({
    id: billId,
    companyId,
    paymentMethod: newBill.payment_method,
    paymentStatus: newBill.payment_status,
    splitPayments: newBill.split_payments,
    grandTotal: newBill.grand_total,
    createdAt: newBill.created_at,
    deleted: newBill.deleted,
    isMarkit: newBill.is_markit,
    invoiceNumber: newBill.invoice_number,
  })

  const deltas = new Map<string, { row: AccountLedgerRowInput; amount: number }>()
  const keyFor = (row: AccountLedgerRowInput) => `${row.accountType}|${row.accountId || ''}`
  const addDelta = (row: AccountLedgerRowInput, amount: number) => {
    const key = keyFor(row)
    const existing = deltas.get(key)
    if (existing) existing.amount += amount
    else deltas.set(key, { row, amount })
  }

  for (const row of oldRows) addDelta(row, -Number(row.amount || 0))
  for (const row of newRows) addDelta(row, Number(row.amount || 0))

  const note = newBill.invoice_number
    ? `Payment change Sale #${newBill.invoice_number}`
    : 'Payment change'

  return [...deltas.values()]
    .filter(({ amount }) => Math.abs(amount) > 0.009)
    .map(({ row, amount }) => ({
      ...row,
      direction: amount > 0 ? 'CREDIT' as const : 'DEBIT' as const,
      amount: Math.abs(amount),
      entryDate: new Date(),
      note,
    }))
}
