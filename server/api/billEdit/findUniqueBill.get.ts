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
        b.subtotal,
        b.discount,
        b.tax,
        b.grand_total          AS "grandTotal",
        b.redeemed_points      AS "redeemedPoints",
        b.bill_points          AS "billPoints",
        b.delivery_fees        AS "deliveryFees",
        b.payment_method       AS "paymentMethod",
        b.payment_status       AS "paymentStatus",
        b.split_payments       AS "splitPayments",
        b.notes,
        b.return_deadline      AS "returnDeadline",
        b.account_id           AS "accountId",
        b.type,
        b.status,
        b.is_markit            AS "isMarkit",
        b.coupon_value         AS "couponValue",

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
      LEFT JOIN addresses a ON a.id = b.address_id
      LEFT JOIN clients c ON c.id = b.client_id
      LEFT JOIN company_clients cc
        ON cc.client_id = c.id AND cc.company_id = $2

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
