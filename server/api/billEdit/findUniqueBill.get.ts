import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const billId = query.billId as string
  const companyId = query.companyId as string

  if (!billId || !companyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'billId and companyId are required'
    })
  }

  const client = await pool.connect()

  try {
    /* ----------------------------------------
       BILL + ADDRESS + CLIENT + POINTS
    ---------------------------------------- */
    const billRes = await client.query(
      `
      SELECT
        b.id,
        b.created_at           AS "createdAt",
        b.invoice_number       AS "invoiceNumber",
        t.order_number         AS "orderNumber",
        b.subtotal,
        b.discount,
        b.tax,
        b.grand_total          AS "grandTotal",
        b.redeemed_points      AS "redeemedPoints",
        b.bill_points          AS "billPoints",
        COALESCE((t.delivery_fees_store ->> b.company_id)::numeric, 0) AS "deliveryFees",
        COALESCE((t.waiting_fees_store  ->> b.company_id)::numeric, 0) AS "waitingFee",
        b.commission           AS "commission",
        b.payment_method       AS "paymentMethod",
        b.payment_status       AS "paymentStatus",
        b.split_payments       AS "splitPayments",
        b.notes,
        b.return_deadline      AS "returnDeadline",
        b.account_id           AS "accountId",
        b.credit_user_id       AS "creditUserId",
        b.company_id           AS "companyId",
        b.trynbuy_id           AS "trynbuyId",
        b.type,
        b.status,
        b.is_markit            AS "isMarkit",
        b.coupon_value         AS "couponValue",
        COALESCE(cp.total_penalty, 0) AS "storeCancellationFine",

        -- Address
        json_build_object(
          'street', a.street,
          'locality', a.locality,
          'city', a.city,
          'state', a.state,
          'pincode', a.pincode
        ) AS address,

        -- Client + points
        json_build_object(
          'id', c.id,
          'name', c.name,
          'phone', c.phone,
          'companies', json_build_array(
            json_build_object(
              'points', cc.points
            )
          )
        ) AS client

      FROM bills b
      LEFT JOIN trynbuys t ON t.id = b.trynbuy_id
      LEFT JOIN addresses a ON a.id = b.address_id
      LEFT JOIN clients c ON c.id = b.client_id
      LEFT JOIN company_clients cc
        ON cc.client_id = c.id AND cc.company_id = $2
      LEFT JOIN (
        SELECT trynbuy_id, company_id, SUM(amount) AS total_penalty
        FROM company_penalties
        GROUP BY trynbuy_id, company_id
      ) cp
        ON cp.trynbuy_id = b.trynbuy_id AND cp.company_id = b.company_id

      WHERE b.id = $1
        AND b.company_id = $2
        AND b.deleted = false
      `,
      [billId, companyId]
    )

    if (!billRes.rows.length) {
      throw createError({ statusCode: 404, statusMessage: 'Bill not found' })
    }

    const bill = billRes.rows[0]

    if (bill.trynbuyId && bill.companyId) {
      const earningsRes = await client.query(
        `
        SELECT store_waitings
        FROM delivery_partner_earnings
        WHERE trynbuy_id = $1
        LIMIT 1
        `,
        [bill.trynbuyId]
      )

      const storeWaitings = earningsRes.rows[0]?.store_waitings
      let parsedStoreWaitings: any[] = []

      try {
        parsedStoreWaitings = Array.isArray(storeWaitings)
          ? storeWaitings
          : typeof storeWaitings === 'string'
            ? JSON.parse(storeWaitings)
            : storeWaitings || []
      } catch {
        parsedStoreWaitings = []
      }

      const matchedStoreWaiting = parsedStoreWaitings.find((row) =>
        row?.companyId === bill.companyId || row?.company_id === bill.companyId
      )

      bill.storeWaitingFee = Number(
        matchedStoreWaiting?.waitingFees
        ?? matchedStoreWaiting?.waitingFee
        ?? matchedStoreWaiting?.amount
        ?? 0
      )
    } else {
      bill.storeWaitingFee = 0
    }

    /* ----------------------------------------
       ENTRIES
    ---------------------------------------- */
    const entryRes = await client.query(
      `
      SELECT
        e.id,
        e.barcode,
        e.name,
        e.qty,
        e.rate,
        e.discount,
        e.tax,
        e.value,
        e.size,
        e.out_of_stock      AS "outOfStock",
        e.category_id       AS "categoryId",
        e.return,
        e.user_name         AS "userName",
        e.company_id        AS "companyUser",
        e.user_id           AS "userId",

        -- Item
        json_build_object(
          'id', i.id,
          'size', i.size
        ) AS item,

        -- Variant
        json_build_object(
          'id', v.id,
          'unit', v.unit,
          'images', v.images
        ) AS variant

      FROM entries e
      LEFT JOIN items i ON i.id = e.item_id
      LEFT JOIN variants v ON v.id = e.variant_id
      WHERE e.bill_id = $1
      `,
      [billId]
    )

    bill.entries = entryRes.rows

    /* ----------------------------------------
       COUPON USAGE
    ---------------------------------------- */
    const couponRes = await client.query(
      `
      SELECT
        cu.coupon_id AS "couponId",
        json_build_object(
          'code', c.code,
          'type', c.type
        ) AS coupon
      FROM coupon_usages cu
      JOIN coupons c ON c.id = cu.coupon_id
      WHERE cu.bill_id = $1
      `,
      [billId]
    )

    bill.couponUsage = couponRes.rows

    return bill
  } finally {
    client.release()
  }
})
