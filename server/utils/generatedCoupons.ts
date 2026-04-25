import crypto from 'crypto'

type Queryable = {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>
}

type GenerateCouponsInput = {
  clientId?: string | null
  companyId?: string | null
  grandTotal: number
  billId?: string | null
  billDate?: string | Date | null
}

export type GeneratedCouponVoucher = {
  id: string
  couponId: string
  couponNumber: string
  code: string
  type: string
  discountValue: number | null
  maxDiscountAmount: number | null
  minOrderValue: number | null
  endDate: string | Date
  usageLimit: number | null
  generatedFromBillId: string | null
}

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function serializeVoucher(row: any): GeneratedCouponVoucher {
  const code = String(row.code ?? '')
  const usageLimit = row.usage_limit == null ? null : Number(row.usage_limit)
  return {
    id: row.id,
    couponId: row.coupon_id,
    couponNumber: code,
    code,
    type: row.type,
    discountValue: row.discount_value == null ? null : Number(row.discount_value),
    maxDiscountAmount: row.max_discount_amount == null ? null : Number(row.max_discount_amount),
    minOrderValue: row.min_order_value == null ? null : Number(row.min_order_value),
    endDate: row.end_date,
    usageLimit,
    generatedFromBillId: row.generated_from_bill_id ?? null,
  }
}

export async function generateCouponsForBill(db: Queryable, input: GenerateCouponsInput) {
  if (input.billId) {
    await db.query(`DELETE FROM coupon_clients WHERE generated_from_bill_id = $1`, [input.billId])
  }

  const clientId = input.clientId || null
  if (!clientId) return []
  const companyId = input.companyId || null

  const billDate = input.billDate ? new Date(input.billDate) : new Date()
  const grandTotal = toNumber(input.grandTotal)

  const couponsResult = await db.query(
    `
    SELECT
      id,
      code,
      type,
      discount_value,
      max_discount_amount,
      min_order_value,
      min_bill_amount,
      is_bill_combine,
      usage_limit,
      per_client_limit,
      times_used,
      start_date,
      end_date
    FROM coupons
    WHERE audience_type = 'GENERATE'
      AND is_active = true
      AND start_date <= $1
      AND end_date >= $1
      AND ($2::text IS NULL OR company_id = $2::text)
    ORDER BY created_at ASC
    `,
    [billDate, companyId],
  )

  const generatedCoupons: GeneratedCouponVoucher[] = []

  for (const coupon of couponsResult.rows) {
    let totalValue = grandTotal

    if (coupon.is_bill_combine) {
      const billsResult = await db.query(
        `
        SELECT COALESCE(SUM(grand_total), 0) AS total
        FROM bills
        WHERE client_id = $1
          AND created_at >= $2
          AND created_at <= $3
        `,
        [clientId, coupon.start_date, coupon.end_date],
      )
      totalValue = toNumber(billsResult.rows[0]?.total)

      if (input.billId) {
        const currentBillIncluded = await db.query(
          `SELECT 1 FROM bills WHERE id = $1 AND client_id = $2`,
          [input.billId, clientId],
        )
        if (!currentBillIncluded.rowCount) {
          totalValue += grandTotal
        }
      }
    }

    const minBillAmount = toNumber(coupon.min_bill_amount || 1)
    if (coupon.min_bill_amount && totalValue < toNumber(coupon.min_bill_amount)) {
      continue
    }

    const alreadyGivenResult = await db.query(
      `
      SELECT COALESCE(SUM(COALESCE(usage_limit, 1)), 0)::int AS count
      FROM coupon_clients
      WHERE coupon_id = $1
        AND client_id = $2
      `,
      [coupon.id, clientId],
    )
    const alreadyGiven = toNumber(alreadyGivenResult.rows[0]?.count)
    const eligibleCount = Math.floor(totalValue / minBillAmount)
    let newCoupons = coupon.is_bill_combine ? eligibleCount - alreadyGiven : eligibleCount

    const perClientLimit = coupon.per_client_limit == null ? Infinity : toNumber(coupon.per_client_limit)
    newCoupons = Math.min(newCoupons, perClientLimit - alreadyGiven)

    if (coupon.usage_limit != null) {
      const remainingGlobal = toNumber(coupon.usage_limit) - toNumber(coupon.times_used)
      newCoupons = Math.min(newCoupons, remainingGlobal)
    }

    if (newCoupons <= 0) continue

    const created = await db.query(
      `
      INSERT INTO coupon_clients (
        id,
        coupon_id,
        client_id,
        generated_from_bill_id,
        usage_limit
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, coupon_id, usage_limit, generated_from_bill_id
      `,
      [crypto.randomUUID(), coupon.id, clientId, input.billId || null, 1],
    )

    generatedCoupons.push(
      serializeVoucher({
        ...coupon,
        ...created.rows[0],
      }),
    )
  }

  return generatedCoupons
}

export function createPrismaQueryable(tx: any): Queryable {
  return {
    async query(sql: string, params: any[] = []) {
      const normalized = sql.trim().toUpperCase()
      const shouldReturnRows = normalized.startsWith('SELECT') || normalized.includes(' RETURNING ')

      if (shouldReturnRows) {
        const rows = await tx.$queryRawUnsafe(sql, ...params)
        return { rows: Array.isArray(rows) ? rows : [], rowCount: Array.isArray(rows) ? rows.length : 0 }
      }

      const rowCount = await tx.$executeRawUnsafe(sql, ...params)
      return { rows: [], rowCount }
    },
  }
}
