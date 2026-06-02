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

    // Snapshot the pre-edit state of every edited entry in ONE query
    // (was one SELECT per edited row). Entries are still pre-edit here, which
    // is also what the trigger_bill_update snapshot above relied on.
    const editEntryIds = itemsWithId.map((i: any) => i.entryId).filter(Boolean)
    const oldEntryMap = new Map<string, { qty: any; return: boolean; item_id: string | null }>()
    if (editEntryIds.length) {
      const oldEntriesRes = await client.query(
        `SELECT id, qty, return, item_id FROM entries WHERE id = ANY($1::text[])`,
        [editEntryIds],
      )
      for (const row of oldEntriesRes.rows) {
        oldEntryMap.set(row.id, { qty: row.qty, return: row.return, item_id: row.item_id })
      }
    }

    // Accumulate every stock delta (edits reverse old + apply new, new rows,
    // deletes reverse) keyed by item id, applied in a single UPDATE at the end.
    const stockDeltas = new Map<string, { sold: number; qty: number }>()
    const addDelta = (id: string | null, sold: number, qty: number) => {
      if (!id) return
      const cur = stockDeltas.get(id) || { sold: 0, qty: 0 }
      cur.sold += sold
      cur.qty += qty
      stockDeltas.set(id, cur)
    }

    // edited entries: reverse the OLD effect, then apply the NEW effect
    for (const item of itemsWithId) {
      const oldEntry = oldEntryMap.get(item.entryId)
      if (oldEntry?.item_id) {
        const oldQty = toNumber(oldEntry.qty)
        if (oldEntry.return) addDelta(oldEntry.item_id, oldQty, -oldQty)
        else addDelta(oldEntry.item_id, -oldQty, oldQty)
      }
      const newItemId = item.id?.trim() || null
      if (newItemId) {
        const newQty = toNumber(item.qty || 1)
        if (item.return) addDelta(newItemId, -newQty, newQty)
        else addDelta(newItemId, newQty, -newQty)
      }
    }

    // brand-new entries: apply stock effect
    for (const item of itemsWithoutId) {
      if (!item.id) continue
      const q = toNumber(item.qty)
      if (item.return) addDelta(item.id, -q, q)
      else addDelta(item.id, q, -q)
    }

    // deleted entries: reverse their original effect
    for (const item of entriesToDelete) {
      if (!item.itemId) continue
      const q = toNumber(item.qty)
      if (item.return) addDelta(item.itemId, q, -q)
      else addDelta(item.itemId, -q, q)
    }

    // Insert brand-new entries in ONE multi-row INSERT
    if (itemsWithoutId.length) {
      const COLS = 17
      const values: any[] = []
      const rows = itemsWithoutId.map((item: any, i: number) => {
        const base = i * COLS
        values.push(
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
        )
        const ph = Array.from({ length: COLS }, (_, k) => `$${base + k + 1}`)
        return `(${ph.join(', ')})`
      })
      await client.query(
        `
        INSERT INTO entries (
          id, name, qty, rate, discount, tax, value, size, barcode,
          return, variant_id, item_id, category_id, company_id, user_id, bill_id, user_name
        )
        VALUES ${rows.join(', ')}
        `,
        values,
      )
    }

    // Update edited entries in ONE bulk UPDATE (was one UPDATE per row)
    if (itemsWithId.length) {
      const ids: string[] = []
      const companyIds: (string | null)[] = []
      const barcodes: (string | null)[] = []
      const qtys: number[] = []
      const rates: number[] = []
      const names: string[] = []
      const discounts: number[] = []
      const taxes: number[] = []
      const valuesArr: number[] = []
      const returns: boolean[] = []
      const variantIds: (string | null)[] = []
      const categoryIds: (string | null)[] = []
      const itemIds: (string | null)[] = []
      const userIds: (string | null)[] = []
      const userNames: (string | null)[] = []
      for (const item of itemsWithId) {
        ids.push(item.entryId)
        companyIds.push(resolvedCompanyId)
        barcodes.push(item.barcode || null)
        qtys.push(toNumber(item.qty || 1))
        rates.push(toNumber(item.rate || 0))
        names.push(item.name || '')
        discounts.push(toNumber(item.discount || 0))
        taxes.push(toNumber(item.tax || 0))
        valuesArr.push(toNumber(item.value || 0))
        returns.push(item.return || false)
        variantIds.push(item.variantId?.trim() || null)
        categoryIds.push(item.category?.[0]?.id?.trim() || null)
        itemIds.push(item.id?.trim() || null)
        userIds.push(item.userId?.trim() || null)
        userNames.push(item.user || null)
      }
      await client.query(
        `
        UPDATE entries AS e
        SET company_id  = u.company_id,
            barcode     = u.barcode,
            qty         = u.qty,
            rate        = u.rate,
            name        = u.name,
            discount    = u.discount,
            tax         = u.tax,
            value       = u.value,
            return      = u.return,
            variant_id  = u.variant_id,
            category_id = u.category_id,
            item_id     = u.item_id,
            user_id     = u.user_id,
            user_name   = u.user_name
        FROM unnest(
          $1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[],
          $6::text[], $7::float8[], $8::float8[], $9::float8[], $10::bool[],
          $11::text[], $12::text[], $13::text[], $14::text[], $15::text[]
        ) AS u(
          id, company_id, barcode, qty, rate, name, discount, tax, value,
          return, variant_id, category_id, item_id, user_id, user_name
        )
        WHERE e.id = u.id
        `,
        [
          ids, companyIds, barcodes, qtys, rates,
          names, discounts, taxes, valuesArr, returns,
          variantIds, categoryIds, itemIds, userIds, userNames,
        ],
      )
    }

    // Apply all accumulated stock deltas in ONE bulk UPDATE
    if (stockDeltas.size) {
      const ids: string[] = []
      const soldDeltas: number[] = []
      const qtyDeltas: number[] = []
      for (const [id, d] of stockDeltas) {
        ids.push(id)
        soldDeltas.push(d.sold)
        qtyDeltas.push(d.qty)
      }
      await client.query(
        `UPDATE items AS i
         SET sold_qty = COALESCE(i.sold_qty, 0) + u.sold_delta,
             qty      = COALESCE(i.qty, 0) + u.qty_delta
         FROM unnest($1::text[], $2::numeric[], $3::numeric[]) AS u(id, sold_delta, qty_delta)
         WHERE i.id = u.id`,
        [ids, soldDeltas, qtyDeltas],
      )
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
