import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

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
    await client.query('BEGIN')

    const billRes = await client.query(
      `
      SELECT invoice_number, client_id, bill_points, redeemed_points
      FROM bills
      WHERE id = $1
        AND company_id = $2
        AND deleted = false
      FOR UPDATE
      `,
      [billId, companyId]
    )

    if (!billRes.rowCount) {
      await client.query('ROLLBACK')
      throw createError({
        statusCode: 404,
        statusMessage: 'Bill not found or already deleted',
      })
    }

    // Reverse sale entries: sold_qty -= qty, qty += qty
    await client.query(
      `
      UPDATE items i
      SET sold_qty = COALESCE(i.sold_qty, 0) - e.qty,
          qty      = COALESCE(i.qty, 0)      + e.qty,
          updated_at = NOW()
      FROM entries e
      WHERE e.bill_id = $1
        AND e.item_id = i.id
        AND e.return = false
        AND e.qty > 0
      `,
      [billId]
    )

    // Reverse return entries: sold_qty += qty, qty -= qty
    await client.query(
      `
      UPDATE items i
      SET sold_qty = COALESCE(i.sold_qty, 0) + e.qty,
          qty      = COALESCE(i.qty, 0)      - e.qty,
          updated_at = NOW()
      FROM entries e
      WHERE e.bill_id = $1
        AND e.item_id = i.id
        AND e.return = true
        AND e.qty > 0
      `,
      [billId]
    )

    // Reverse client points contribution: original create did points += billPoints - redeemedPoints
    const bill = billRes.rows[0]
    const pointsDelta = (Number(bill.bill_points) || 0) - (Number(bill.redeemed_points) || 0)
    if (bill.client_id && pointsDelta !== 0) {
      await client.query(
        `
        UPDATE company_clients
        SET points = COALESCE(points, 0) - $1
        WHERE company_id = $2
          AND client_id = $3
        `,
        [pointsDelta, companyId, bill.client_id]
      )
    }

    // Reverse coupon usage: decrement coupons.times_used and restore coupon_clients.usage_limit
    // Keep coupon_usages rows intact so restore can re-apply.
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
        `UPDATE coupons SET times_used = GREATEST(COALESCE(times_used, 0) - 1, 0) WHERE id = $1`,
        [usage.coupon_id]
      )
      if (usage.audience_type === 'GENERATE' && usage.client_id) {
        await client.query(
          `
          UPDATE coupon_clients
          SET usage_limit = COALESCE(usage_limit, 0) + 1
          WHERE id = (
            SELECT id FROM coupon_clients
            WHERE coupon_id = $1 AND client_id = $2
            ORDER BY "createdAt" DESC
            LIMIT 1
          )
          `,
          [usage.coupon_id, usage.client_id]
        )
      }
    }

    await client.query(
      `
      UPDATE bills
      SET deleted = true,
          updated_at = now()
      WHERE id = $1
        AND company_id = $2
      `,
      [billId, companyId]
    )

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
      statusMessage: 'Failed to delete bill',
      data: { message: err?.message },
    })
  } finally {
    client.release()
  }
})
