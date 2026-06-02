import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { useAuthSession } from '~~/auth/server/utils/session'

const SORT_COLUMN_MAP: Record<string, string> = {
  orderNumber: 'COALESCE(t.order_number, 0)',
  invoiceNumber: 'b.invoice_number',
  createdAt: 'b.created_at',
  grandTotal: 'b.grand_total',
  paymentStatus: 'b.payment_status',
}

export default defineEventHandler(async (event) => {
  const authSession = await useAuthSession(event)
  const cleanup = authSession.data.cleanup ?? false

  const body = await readBody(event)

  const {
    companyId,
    search,
    selectedStatus,
    selectedPaymentMethods,
    minGrandTotal,
    maxGrandTotal,
    startDate,
    endDate,
    page = 1,
    pageCount = 5,
    sortColumn = 'orderNumber',
    sortDirection = 'desc',
    isMarkitOnly = false,
    excludeMarkit = false,
    closingDate = null,
  } = body

  const queryStartDate = startDate
    ? new Date(startDate as string)
    : new Date(0)

  const queryEndDate = endDate
    ? new Date(endDate as string)
    : new Date()

  const queryClosingDate = closingDate
    ? new Date(closingDate as string)
    : null

  if (!companyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'companyId is required',
    })
  }

  const normalizedSearch =
    typeof search === 'string' && search.trim().length
      ? search.trim()
      : null

  const client = await pool.connect()

  try {
    if (cleanup) {
      await client.query('ALTER TABLE bills ADD COLUMN IF NOT EXISTS original_subtotal DOUBLE PRECISION')
      await client.query('ALTER TABLE bills ADD COLUMN IF NOT EXISTS original_grand_total DOUBLE PRECISION')
      await client.query('ALTER TABLE bills ADD COLUMN IF NOT EXISTS original_discount DOUBLE PRECISION')
      await client.query('ALTER TABLE entries ADD COLUMN IF NOT EXISTS original_rate DOUBLE PRECISION')
      await client.query('ALTER TABLE entries ADD COLUMN IF NOT EXISTS original_value DOUBLE PRECISION')
      await client.query('ALTER TABLE entries ADD COLUMN IF NOT EXISTS original_discount DOUBLE PRECISION')
    }

    const cleanupBillSelect = cleanup
      ? `
        COALESCE(NULLIF(b.original_subtotal, 0), b.subtotal) AS "originalSubtotal",
        COALESCE(NULLIF(b.original_grand_total, 0), b.grand_total) AS "originalGrandTotal",
        COALESCE(b.original_discount, b.discount) AS "originalDiscount",
      `
      : ''

    const cleanupEntrySelect = cleanup
      ? `
              'originalRate', COALESCE(NULLIF(e.original_rate, 0), e.rate),
              'originalValue', COALESCE(NULLIF(e.original_value, 0), e.value),
              'originalDiscount', COALESCE(e.original_discount, e.discount),
      `
      : ''

    const billSubtotalExpr = cleanup
      ? 'COALESCE(NULLIF(b.original_subtotal, 0), b.subtotal)'
      : 'b.subtotal'

    const billTotalExpr = cleanup
      ? 'COALESCE(NULLIF(b.original_grand_total, 0), b.grand_total)'
      : 'b.grand_total'

    const billDiscountExpr = cleanup
      ? 'COALESCE(b.original_discount, b.discount)'
      : 'b.discount'

    const entryRateExpr = cleanup
      ? 'COALESCE(NULLIF(e.original_rate, 0), e.rate)'
      : 'e.rate'

    const entryValueExpr = cleanup
      ? 'COALESCE(NULLIF(e.original_value, 0), e.value)'
      : 'e.value'

    const entryDiscountExpr = cleanup
      ? 'COALESCE(e.original_discount, e.discount)'
      : 'e.discount'

    const values: any[] = [companyId]
    let idx = 2

    let whereSQL = `
      b.company_id = $1
      AND b.deleted = false
      AND ($${idx} = true OR b.precedence IS NOT TRUE)
    `
    values.push(cleanup)
    idx++

    /* 🔎 SEARCH RULES */
    let invoiceMatchSelect = '0 AS invoice_match'
    let orderByPrefix = ''
    if (normalizedSearch) {
      const isNumeric = /^\d+$/.test(normalizedSearch)

      if (!isNumeric) {
        whereSQL += ` AND c.name ILIKE $${idx}`
        values.push(`%${normalizedSearch}%`)
        idx++
      } else {
        const numVal = Number(normalizedSearch)
        const fitsInt = Number.isFinite(numVal) && numVal <= 2147483647

        if (fitsInt) {
          const invoiceParamIndex = idx
          if (queryClosingDate) {
            whereSQL += `
              AND (
                (b.invoice_number = $${idx} AND b.created_at > $${idx + 2})
                OR c.phone ILIKE $${idx + 1}
              )
            `
            values.push(numVal, `%${normalizedSearch}%`, queryClosingDate)
            idx += 3
          } else {
            whereSQL += `
              AND (
                b.invoice_number = $${idx}
                OR c.phone ILIKE $${idx + 1}
              )
            `
            values.push(numVal, `%${normalizedSearch}%`)
            idx += 2
          }
          invoiceMatchSelect = `CASE WHEN b.invoice_number = $${invoiceParamIndex} THEN 1 ELSE 0 END AS invoice_match`
          orderByPrefix = 'invoice_match DESC, '
        } else {
          // Number too big to fit in int (e.g. very long phone-like string) — phone only
          whereSQL += ` AND c.phone ILIKE $${idx}`
          values.push(`%${normalizedSearch}%`)
          idx++
        }
      }
    }

    /* 🛍️ Markit filter */
    if (isMarkitOnly) {
      whereSQL += ` AND b.is_markit = true`
    } else if (excludeMarkit) {
      whereSQL += ` AND (b.is_markit = false OR b.is_markit IS NULL)`
    }

    /* 💳 Payment status */
    if (selectedStatus?.length) {
      whereSQL += ` AND b.payment_status::text = ANY($${idx}::text[])`
      values.push(selectedStatus.map((s: any) => s.value))
      idx++
    }

    if (selectedPaymentMethods?.length) {
      whereSQL += ` AND b.payment_method::text = ANY($${idx}::text[])`
      values.push(
        selectedPaymentMethods.map((m: any) =>
          typeof m === 'string' ? m : m.value
        )
      )
      idx++
    }

    if (minGrandTotal !== undefined && minGrandTotal !== null && minGrandTotal !== '') {
      whereSQL += ` AND ${billTotalExpr} >= $${idx}`
      values.push(Number(minGrandTotal))
      idx++
    }

    if (maxGrandTotal !== undefined && maxGrandTotal !== null && maxGrandTotal !== '') {
      whereSQL += ` AND ${billTotalExpr} <= $${idx}`
      values.push(Number(maxGrandTotal))
      idx++
    }

    /* 📅 DATE FILTER (FIXED) */
    if (!normalizedSearch && startDate && endDate) {
      whereSQL += `
        AND b.created_at BETWEEN $${idx} AND $${idx + 1}
      `
      values.push(queryStartDate, queryEndDate)
      idx += 2
    }

    const orderByColumn =
      sortColumn === 'grandTotal'
        ? billTotalExpr
        : (SORT_COLUMN_MAP[sortColumn] || 'b.invoice_number')

    const orderByDirection =
      sortDirection === 'asc' ? 'ASC' : 'DESC'

    /* 🔥 MAIN QUERY */
    const query = `
      SELECT
        b.id,
        b.precedence,
        b.is_markit        AS "isMarkit",
        b.created_at       AS "createdAt",
        t.order_number     AS "orderNumber",
        b.invoice_number   AS "invoiceNumber",
        ${billSubtotalExpr} AS subtotal,
        ${cleanupBillSelect}
        ${billDiscountExpr} AS discount,
        b.tax,
        ${billTotalExpr}   AS "grandTotal",
        b.payment_status   AS "paymentStatus",
        b.payment_method   AS "paymentMethod",
        b.notes,
        b.split_payments   AS "splitPayments",

        json_build_object(
          'name', c.name,
          'phone', c.phone
        ) AS client,

        COALESCE(
          json_agg(
            json_build_object(
              'barcode', e.barcode,
              'category', cat.name,
              'name', e.name,
              'rate', ${entryRateExpr},
              ${cleanupEntrySelect}
              'qty', e.qty,
              'discount', ${entryDiscountExpr},
              'tax', e.tax,
              'value', ${entryValueExpr}
            )
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'
        ) AS entries,

        ${invoiceMatchSelect},
        COUNT(*) OVER() AS total_count

      FROM bills b
      LEFT JOIN trynbuys t ON t.id = b.trynbuy_id
      LEFT JOIN clients c ON c.id = b.client_id
      LEFT JOIN entries e ON e.bill_id = b.id
      LEFT JOIN categories cat ON cat.id = e.category_id

      WHERE ${whereSQL}

      GROUP BY b.id, c.id, t.order_number

      ORDER BY ${orderByPrefix}${orderByColumn} ${orderByDirection}
      LIMIT $${idx} OFFSET $${idx + 1}
    `

    /* 📊 TOTALS QUERY — same WHERE, all pages */
    const totalsValues = [...values]
    const totalsQuery = `
      SELECT
        COALESCE(SUM(${billTotalExpr}), 0)                                                AS total,
        COALESCE(
          SUM(${billTotalExpr}) FILTER (WHERE b.payment_method = 'Cash'),
          0
        )
        +
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_method = 'Split' THEN split_totals.cash
              ELSE 0
            END
          ),
          0
        )                                                                                 AS cash,
        COALESCE(
          SUM(${billTotalExpr}) FILTER (WHERE b.payment_method = 'Card'),
          0
        )
        +
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_method = 'Split' THEN split_totals.card
              ELSE 0
            END
          ),
          0
        )                                                                                 AS card,
        COALESCE(
          SUM(${billTotalExpr}) FILTER (WHERE b.payment_method = 'UPI'),
          0
        )
        +
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_method = 'Split' THEN split_totals.upi
              ELSE 0
            END
          ),
          0
        )                                                                                 AS upi,
        COALESCE(
          SUM(${billTotalExpr}) FILTER (WHERE b.payment_method = 'Credit'),
          0
        )
        +
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_method = 'Split' THEN split_totals.credit
              ELSE 0
            END
          ),
          0
        )                                                                                 AS credit
      FROM bills b
      LEFT JOIN clients c ON c.id = b.client_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN split_item ->> 'method' = 'Cash'
                THEN COALESCE(NULLIF(split_item ->> 'amount', '')::numeric, 0)
                ELSE 0
              END
            ),
            0
          ) AS cash,
          COALESCE(
            SUM(
              CASE
                WHEN split_item ->> 'method' = 'Card'
                THEN COALESCE(NULLIF(split_item ->> 'amount', '')::numeric, 0)
                ELSE 0
              END
            ),
            0
          ) AS card,
          COALESCE(
            SUM(
              CASE
                WHEN split_item ->> 'method' = 'UPI'
                THEN COALESCE(NULLIF(split_item ->> 'amount', '')::numeric, 0)
                ELSE 0
              END
            ),
            0
          ) AS upi,
          COALESCE(
            SUM(
              CASE
                WHEN split_item ->> 'method' = 'Credit'
                THEN COALESCE(NULLIF(split_item ->> 'amount', '')::numeric, 0)
                ELSE 0
              END
            ),
            0
          ) AS credit
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(b.split_payments::jsonb) = 'array'
            THEN b.split_payments::jsonb
            ELSE '[]'::jsonb
          END
        ) AS split_item
      ) split_totals ON true
      WHERE ${whereSQL}
    `

    values.push(
      Number(pageCount),
      (Number(page) - 1) * Number(pageCount)
    )

    const [res, totalsRes] = await Promise.all([
      client.query(query, values),
      client.query(totalsQuery, totalsValues),
    ])

    const t = totalsRes.rows[0] ?? {}

    return {
      rows: res.rows.map(({ total_count, splitPayments, ...row }) => ({
        ...row,
        splitPayments: typeof splitPayments === 'string'
          ? (() => { try { return JSON.parse(splitPayments) } catch { return [] } })()
          : (splitPayments ?? []),
      })),
      total: res.rows[0]?.total_count ?? 0,
      totals: {
        total:  Number(t.total  ?? 0),
        cash:   Number(t.cash   ?? 0),
        card:   Number(t.card   ?? 0),
        upi:    Number(t.upi    ?? 0),
        credit: Number(t.credit ?? 0),
      },
    }
  } finally {
    client.release()
  }
})
