import crypto from 'crypto'
import { createError } from 'h3'
import { pool } from '~/server/db'
import { generateCouponsForBill } from '~/server/utils/generatedCoupons'

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function toJson(value: unknown) {
  return value == null ? null : JSON.stringify(value)
}

async function applyPointsDelta(
  client: any,
  companyId: string,
  clientId: string,
  delta: number,
) {
  const amount = toNumber(delta)
  if (!clientId || amount === 0) return

  if (amount > 0) {
    const res = await client.query(
      `
      UPDATE company_clients
      SET points = COALESCE(points, 0) + $3
      WHERE company_id = $1
        AND client_id = $2
      RETURNING points
      `,
      [companyId, clientId, amount],
    )

    if (!res.rowCount) {
      throw new Error('Client not found while adding points')
    }
    return
  }

  const deduction = Math.abs(amount)
  const res = await client.query(
    `
    UPDATE company_clients
    SET points = COALESCE(points, 0) - $3
    WHERE company_id = $1
      AND client_id = $2
      AND points >= $3
    RETURNING points
    `,
    [companyId, clientId, deduction],
  )

  if (!res.rowCount) {
    throw new Error('Insufficient points or client not found')
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  await useAuthSession(event)

  const {
    items = [],
    entriesToDelete = [],
    billPoints = 0,
    billData,
  } = body || {}

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const billResult = await client.query(
      `
      SELECT id, client_id, redeemed_points, bill_points, company_id
      FROM bills
      WHERE id = $1
      FOR UPDATE
      `,
      [billData.id],
    )

    if (!billResult.rowCount) {
      throw new Error('Bill not found')
    }

    const existingBill = billResult.rows[0]
    const oldClientId = existingBill.client_id || null
    const oldBillPoints = toNumber(existingBill.bill_points)
    const oldRedeemedPoints = toNumber(existingBill.redeemed_points)
    const resolvedCompanyId = billData.companyId || existingBill.company_id

    let resolvedClientId = billData.clientId || null
    if (resolvedClientId) {
      const clientExists = await client.query(
        `SELECT 1 FROM clients WHERE id = $1`,
        [resolvedClientId],
      )
      if (!clientExists.rowCount) {
        resolvedClientId = null
      }
    }

    const currentBillPoints = resolvedClientId ? oldBillPoints + toNumber(billPoints) : 0
    const currentRedeemedPoints = resolvedClientId ? toNumber(billData.redeemedPoints) : 0

    const itemsWithId = items.filter((item: any) => item.entryId)
    const itemsWithoutId = items.filter((item: any) => !item.entryId)

    // Update the bills row FIRST so the trigger_bill_update fires while entries are still
    // in their pre-edit state — this gives bill_history an accurate OLD-state snapshot.
    await client.query(
      `
      UPDATE bills
      SET
        subtotal = $2,
        discount = $3,
        grand_total = $4,
        redeemed_points = $5,
        coupon_value = $6,
        payment_method = $7,
        payment_status = $8,
        split_payments = $9::jsonb,
        account_id = $10,
        client_id = $11,
        created_at = $12,
        company_id = $13,
        updated_at = now()
      WHERE id = $1
      `,
      [
        billData.id,
        billData.subtotal || 0,
        billData.discount || 0,
        billData.grandTotal || 0,
        currentRedeemedPoints,
        billData.couponValue || 0,
        billData.paymentMethod || 'Cash',
        billData.paymentStatus || 'PAID',
        toJson(billData.splitPayments),
        billData.accountId || null,
        resolvedClientId,
        billData.date,
        resolvedCompanyId,
      ],
    )

    for (const item of itemsWithoutId) {
      await client.query(
        `
        INSERT INTO entries (
          id, name, qty, rate, discount, tax, value, size, barcode,
          return, variant_id, item_id, category_id, company_id, user_id, bill_id, user_name
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17
        )
        `,
        [
          crypto.randomUUID(),
          item.name || '',
          item.qty || 1,
          item.rate || 0,
          item.discount || 0,
          item.tax || 0,
          item.value || 0,
          item.size || null,
          item.barcode || null,
          item.return || false,
          item.variantId?.trim() || null,
          item.id?.trim() || null,
          item.category?.[0]?.id?.trim() || null,
          resolvedCompanyId,
          item.userId?.trim() || null,
          billData.id,
          item.user || null,
        ],
      )
    }

    for (const item of itemsWithId) {
      const oldEntryRes = await client.query(
        `SELECT qty, return, item_id FROM entries WHERE id = $1`,
        [item.entryId],
      )
      const oldEntry = oldEntryRes.rows[0]

      if (oldEntry?.item_id) {
        const oldQty = toNumber(oldEntry.qty)
        if (oldEntry.return) {
          await client.query(
            `
            UPDATE items
            SET sold_qty = COALESCE(sold_qty, 0) + $1,
                qty = COALESCE(qty, 0) - $1
            WHERE id = $2
            `,
            [oldQty, oldEntry.item_id],
          )
        } else {
          await client.query(
            `
            UPDATE items
            SET sold_qty = COALESCE(sold_qty, 0) - $1,
                qty = COALESCE(qty, 0) + $1
            WHERE id = $2
            `,
            [oldQty, oldEntry.item_id],
          )
        }
      }

      const newItemId = item.id?.trim() || null
      if (newItemId) {
        const newQty = toNumber(item.qty || 1)
        if (item.return) {
          await client.query(
            `
            UPDATE items
            SET sold_qty = COALESCE(sold_qty, 0) - $1,
                qty = COALESCE(qty, 0) + $1
            WHERE id = $2
            `,
            [newQty, newItemId],
          )
        } else {
          await client.query(
            `
            UPDATE items
            SET sold_qty = COALESCE(sold_qty, 0) + $1,
                qty = COALESCE(qty, 0) - $1
            WHERE id = $2
            `,
            [newQty, newItemId],
          )
        }
      }

      await client.query(
        `
        UPDATE entries
        SET
          company_id = $2,
          barcode = $3,
          qty = $4,
          rate = $5,
          name = $6,
          discount = $7,
          tax = $8,
          value = $9,
          return = $10,
          variant_id = $11,
          category_id = $12,
          item_id = $13,
          user_id = $14,
          user_name = $15
        WHERE id = $1
        `,
        [
          item.entryId,
          resolvedCompanyId,
          item.barcode || null,
          item.qty || 1,
          item.rate || 0,
          item.name || '',
          item.discount || 0,
          item.tax || 0,
          item.value || 0,
          item.return || false,
          item.variantId?.trim() || null,
          item.category?.[0]?.id?.trim() || null,
          item.id?.trim() || null,
          item.userId?.trim() || null,
          item.user || null,
        ],
      )
    }

    for (const item of itemsWithoutId) {
      if (!item.id) continue

      if (item.return) {
        await client.query(
          `
          UPDATE items
          SET sold_qty = COALESCE(sold_qty, 0) - $1,
              qty = COALESCE(qty, 0) + $1
          WHERE id = $2
          `,
          [item.qty, item.id],
        )
      } else {
        await client.query(
          `
          UPDATE items
          SET sold_qty = COALESCE(sold_qty, 0) + $1,
              qty = COALESCE(qty, 0) - $1
          WHERE id = $2
          `,
          [item.qty, item.id],
        )
      }
    }

    for (const item of entriesToDelete) {
      if (!item.itemId) continue

      if (item.return) {
        await client.query(
          `
          UPDATE items
          SET sold_qty = COALESCE(sold_qty, 0) + $1,
              qty = COALESCE(qty, 0) - $1
          WHERE id = $2
          `,
          [item.qty, item.itemId],
        )
      } else {
        await client.query(
          `
          UPDATE items
          SET sold_qty = COALESCE(sold_qty, 0) - $1,
              qty = COALESCE(qty, 0) + $1
          WHERE id = $2
          `,
          [item.qty, item.itemId],
        )
      }
    }

    const entryIds = entriesToDelete.map((entry: any) => entry.id).filter(Boolean)
    if (entryIds.length) {
      await client.query(
        `DELETE FROM entries WHERE id = ANY($1::text[])`,
        [entryIds],
      )
    }

    if (oldClientId && oldClientId === resolvedClientId) {
      const delta = (currentBillPoints - currentRedeemedPoints) - (oldBillPoints - oldRedeemedPoints)
      await applyPointsDelta(client, resolvedCompanyId, oldClientId, delta)
    } else {
      if (oldClientId) {
        await applyPointsDelta(
          client,
          resolvedCompanyId,
          oldClientId,
          -(oldBillPoints - oldRedeemedPoints),
        )
      }

      if (resolvedClientId) {
        await applyPointsDelta(
          client,
          resolvedCompanyId,
          resolvedClientId,
          currentBillPoints - currentRedeemedPoints,
        )
      }
    }

    const existingCouponUsageResult = await client.query(
      `
      SELECT cu.id, cu.coupon_id, cu.client_id, c.audience_type
      FROM coupon_usages cu
      INNER JOIN coupons c ON c.id = cu.coupon_id
      WHERE cu.bill_id = $1
      LIMIT 1
      `,
      [billData.id],
    )

    const existingCouponUsage = existingCouponUsageResult.rows[0] || null
    const nextCouponId = billData.couponId || null

    const shouldRemoveExistingCoupon =
      !!existingCouponUsage &&
      (!nextCouponId ||
        existingCouponUsage.coupon_id !== nextCouponId ||
        existingCouponUsage.client_id !== resolvedClientId)

    if (shouldRemoveExistingCoupon) {
      if (existingCouponUsage.audience_type === 'GENERATE' && existingCouponUsage.client_id) {
        const restoreRes = await client.query(
          `
          UPDATE coupon_clients
          SET usage_limit = COALESCE(usage_limit, 0) + 1
          WHERE id = (
            SELECT id
            FROM coupon_clients
            WHERE coupon_id = $1
              AND client_id = $2
            ORDER BY "createdAt" ASC
            LIMIT 1
          )
          RETURNING id
          `,
          [existingCouponUsage.coupon_id, existingCouponUsage.client_id],
        )

        if (!restoreRes.rowCount) {
          throw new Error('Failed to restore this generated coupon')
        }
      }

      await client.query(
        `DELETE FROM coupon_usages WHERE id = $1`,
        [existingCouponUsage.id],
      )

      await client.query(
        `UPDATE coupons SET times_used = times_used - 1 WHERE id = $1`,
        [existingCouponUsage.coupon_id],
      )
    }

    const shouldApplyNewCoupon =
      !!nextCouponId &&
      (!existingCouponUsage ||
        existingCouponUsage.coupon_id !== nextCouponId ||
        existingCouponUsage.client_id !== resolvedClientId)

    if (shouldApplyNewCoupon && resolvedClientId) {
      const selectedCouponRes = await client.query(
        `SELECT audience_type FROM coupons WHERE id = $1`,
        [nextCouponId],
      )
      const selectedCoupon = selectedCouponRes.rows[0]

      if (selectedCoupon?.audience_type === 'GENERATE') {
        const voucherRes = await client.query(
          `
          UPDATE coupon_clients
          SET usage_limit = COALESCE(usage_limit, 0) - 1
          WHERE id = (
            SELECT id
            FROM coupon_clients
            WHERE coupon_id = $1
              AND client_id = $2
              AND COALESCE(usage_limit, 0) > 0
            ORDER BY "createdAt" ASC
            LIMIT 1
          )
          RETURNING id
          `,
          [nextCouponId, resolvedClientId],
        )

        if (!voucherRes.rowCount) {
          throw new Error('No remaining uses for this generated coupon')
        }
      }

      await client.query(
        `
        INSERT INTO coupon_usages (id, coupon_id, client_id, bill_id, used_at)
        VALUES ($1, $2, $3, $4, now())
        `,
        [crypto.randomUUID(), nextCouponId, resolvedClientId, billData.id],
      )

      await client.query(
        `UPDATE coupons SET times_used = times_used + 1 WHERE id = $1`,
        [nextCouponId],
      )
    }

    const generatedCoupons = await generateCouponsForBill(client, {
      clientId: resolvedClientId,
      companyId: resolvedCompanyId,
      grandTotal: billData.grandTotal || 0,
      billId: billData.id,
      billDate: billData.date,
    })

    await client.query('COMMIT')

    return { success: true, generatedCoupons }
  } catch (error: any) {
    await client.query('ROLLBACK')

    console.error('❌ Transaction failed:', error.message)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update bill',
      data: {
        message: error.message,
        data: { items, entriesToDelete, billPoints, billData },
      },
    })
  } finally {
    client.release()
  }
})
