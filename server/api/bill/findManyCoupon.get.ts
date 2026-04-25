import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  /* -------------------------------
     READ QUERY
  -------------------------------- */
  const query = getQuery(event)
  const companyId = query.companyId as string | undefined

  if (!companyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'companyId is required',
    })
  }

  const now = new Date()
  const client = await pool.connect()

  try {
    const res = await client.query(
      `
      SELECT
        c.id,
        c.code,
        c.type,
        c.discount_value,
        c.gift_barcode,
        c.max_discount_amount,
        c.min_order_value,
        c.min_bill_amount,
        c.is_bill_combine,
        c.usage_limit,
        c.per_client_limit,
        c.times_used,
        c.target_type,
        c.audience_type,
        c.start_date,
        c.end_date,
        c.is_markit,
        c.is_active,

        /* Eligible clients */
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'clientId', cc.client_id,
                'usageLimit', cc.usage_limit
              )
            )
            FROM coupon_clients cc
            WHERE cc.coupon_id = c.id
          ),
          '[]'
        ) AS eligible_clients,

        /* Used by clients */
        COALESCE(
          (
            SELECT json_agg(cu.client_id)
            FROM coupon_usages cu
            WHERE cu.coupon_id = c.id
          ),
          '[]'
        ) AS used_clients

      FROM coupons c

      WHERE c.company_id = $1
        AND c.is_active = true
        AND c.start_date <= $2
        AND c.end_date >= $2

      ORDER BY c.created_at DESC
      `,
      [companyId, now]
    )

    return res.rows.map((r) => ({
      id: r.id,
      code: r.code,
      type: r.type,
      discountValue: r.discount_value,
      giftBarcode: r.gift_barcode,
      maxDiscountAmount: r.max_discount_amount,
      minOrderValue: r.min_order_value,
      minBillAmount: r.min_bill_amount,
      isBillCombine: r.is_bill_combine,
      usageLimit: r.usage_limit,
      perClientLimit: r.per_client_limit,
      timesUsed: r.times_used,
      targetType: r.target_type,
      audienceType: r.audience_type,
      startDate: r.start_date,
      endDate: r.end_date,
      isMarkit: r.is_markit,
      isActive: r.is_active,
      clients: r.eligible_clients,
      couponUsage: r.used_clients.map((clientId: string) => ({ clientId })),
    }))
  } finally {
    client.release()
  }
})
