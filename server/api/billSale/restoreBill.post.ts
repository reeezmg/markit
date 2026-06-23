import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { creditAmountFromBill, upsertUserLedgerEntry } from '~/server/utils/user-ledger'
import { billLedgerRows, ensureAccountLedgerSchema, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const { billId, companyId } = await readBody(event)

  if (!billId || !companyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'billId and companyId are required',
    })
  }

  const client = await pool.connect()

  try {
    await ensureAccountLedgerSchema(client)
    await client.query('BEGIN')

    const billRes = await client.query(
      `
      SELECT invoice_number, client_id, bill_points, redeemed_points, credit_user_id, payment_method, payment_status, split_payments, grand_total, created_at
      FROM bills
      WHERE id = $1
        AND company_id = $2
        AND deleted = true
      FOR UPDATE
      `,
      [billId, companyId]
    )

    if (!billRes.rowCount) {
      await client.query('ROLLBACK')
      throw createError({
        statusCode: 404,
        statusMessage: 'Bill not found or not in deleted state',
      })
    }

    // Re-apply sale entries: sold_qty += qty, qty -= qty
    await client.query(
      `
      UPDATE items i
      SET sold_qty = COALESCE(i.sold_qty, 0) + e.qty,
          qty      = COALESCE(i.qty, 0)      - e.qty,
          updated_at = NOW()
      FROM entries e
      WHERE e.bill_id = $1
        AND e.item_id = i.id
        AND e.return = false
        AND e.qty > 0
      `,
      [billId]
    )

    // Re-apply return entries: sold_qty -= qty, qty += qty
    await client.query(
      `
      UPDATE items i
      SET sold_qty = COALESCE(i.sold_qty, 0) - e.qty,
          qty      = COALESCE(i.qty, 0)      + e.qty,
          updated_at = NOW()
      FROM entries e
      WHERE e.bill_id = $1
        AND e.item_id = i.id
        AND e.return = true
        AND e.qty > 0
      `,
      [billId]
    )

    // Re-apply client points contribution
    const bill = billRes.rows[0]
    const pointsDelta = (Number(bill.bill_points) || 0) - (Number(bill.redeemed_points) || 0)
    if (bill.client_id && pointsDelta !== 0) {
      await client.query(
        `
        UPDATE company_clients
        SET points = COALESCE(points, 0) + $1
        WHERE company_id = $2
          AND client_id = $3
        `,
        [pointsDelta, companyId, bill.client_id]
      )
    }

    // Re-apply coupon usage (coupon_usages rows are still attached from before delete)
    const couponUsages = await client.query(
      `
      SELECT cu.coupon_id, cu.client_id, c.audience_type
      FROM coupon_usages cu
      JOIN coupons c ON c.id = cu.coupon_id
      WHERE cu.bill_id = $1
      `,
      [billId]
    )
    for (const usage of couponUsages.rows) {
      await client.query(
        `UPDATE coupons SET times_used = COALESCE(times_used, 0) + 1 WHERE id = $1`,
        [usage.coupon_id]
      )
      if (usage.audience_type === 'GENERATE' && usage.client_id) {
        const decRes = await client.query(
          `
          UPDATE coupon_clients
          SET usage_limit = COALESCE(usage_limit, 0) - 1
          WHERE id = (
            SELECT id FROM coupon_clients
            WHERE coupon_id = $1 AND client_id = $2 AND COALESCE(usage_limit, 0) > 0
            ORDER BY "createdAt" ASC
            LIMIT 1
          )
          RETURNING id
          `,
          [usage.coupon_id, usage.client_id]
        )
        if (!decRes.rowCount) {
          throw createError({
            statusCode: 409,
            statusMessage: 'Cannot restore: no remaining uses on the generated coupon',
          })
        }
      }
    }

    await client.query(
      `
      UPDATE bills
      SET deleted = false,
          updated_at = now()
      WHERE id = $1
        AND company_id = $2
      `,
      [billId, companyId]
    )

    if (bill.credit_user_id) {
      await upsertUserLedgerEntry(client, {
        companyId,
        userId: bill.credit_user_id,
        type: 'USER_CREDIT_BILL',
        direction: 'DEBIT',
        sourceType: 'BILL',
        sourceId: billId,
        amount: creditAmountFromBill({
          paymentMethod: bill.payment_method,
          splitPayments: bill.split_payments,
          grandTotal: bill.grand_total,
        }),
        note: `Bill credit${bill.invoice_number ? ` #${bill.invoice_number}` : ''}`,
        createdAt: bill.created_at,
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
        deleted: false,
        isMarkit: false,
        invoiceNumber: bill.invoice_number,
      }),
    })

    await client.query('COMMIT')

    return {
      success: true,
      invoiceNumber: billRes.rows[0].invoice_number,
    }
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err?.statusCode) throw err
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to restore bill',
      data: { message: err?.message },
    })
  } finally {
    client.release()
  }
})
