import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { billLedgerRows, ensureAccountLedgerSchema, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'
import { deleteUserLedgerEntryForSource } from '~/server/utils/user-ledger'

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
      RETURNING invoice_number, payment_status, payment_method, split_payments, grand_total, created_at, is_markit, deleted, credit_user_id
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
    if (bill.payment_method !== 'Credit' && bill.credit_user_id) {
      await deleteUserLedgerEntryForSource(client, {
        companyId,
        sourceType: 'BILL',
        sourceId: billId,
        type: 'USER_CREDIT_BILL',
        userId: bill.credit_user_id,
      })
    }
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'BILL',
      sourceId: billId,
      rows: billLedgerRows({
        id: billId,
        companyId,
        paymentMethod: bill.payment_method,
        paymentStatus: bill.payment_status,
        splitPayments: bill.split_payments,
        grandTotal: bill.grand_total,
        createdAt: bill.created_at,
        deleted: bill.deleted,
        isMarkit: bill.is_markit,
        invoiceNumber: bill.invoice_number,
      }),
    })
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
