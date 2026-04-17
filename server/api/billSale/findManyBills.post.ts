import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { useAuthSession } from '~~/auth/server/utils/session'

const SORT_COLUMN_MAP: Record<string, string> = {
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
    sortColumn = 'invoiceNumber',
    sortDirection = 'desc',
    isMarkitOnly = false,
    excludeMarkit = false,
  } = body

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
        const len = normalizedSearch.length

        if (len < 3) {
          whereSQL += ` AND c.phone ILIKE $${idx}`
          values.push(`%${normalizedSearch}%`)
          idx++
        } else {
          const invoiceParamIndex = idx
          whereSQL += `
            AND (
              b.invoice_number = $${idx}
              OR c.phone ILIKE $${idx + 1}
            )
          `
          values.push(Number(normalizedSearch), `%${normalizedSearch}%`)
          idx += 2
          invoiceMatchSelect = `CASE WHEN b.invoice_number = $${invoiceParamIndex} THEN 1 ELSE 0 END AS invoice_match`
          orderByPrefix = 'invoice_match DESC, '
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
      whereSQL += ` AND b.grand_total >= $${idx}`
      values.push(Number(minGrandTotal))
      idx++
    }

    if (maxGrandTotal !== undefined && maxGrandTotal !== null && maxGrandTotal !== '') {
      whereSQL += ` AND b.grand_total <= $${idx}`
      values.push(Number(maxGrandTotal))
      idx++
    }

    /* 📅 DATE FILTER (FIXED) */
    if (!normalizedSearch && startDate && endDate) {
      whereSQL += `
        AND b.created_at BETWEEN $${idx} AND $${idx + 1}
      `
      values.push(startDate, endDate)
      idx += 2
    }

    const orderByColumn =
      SORT_COLUMN_MAP[sortColumn] || 'b.invoice_number'

    const orderByDirection =
      sortDirection === 'asc' ? 'ASC' : 'DESC'

    /* 🔥 MAIN QUERY */
    const query = `
      SELECT
        b.id,
        b.precedence,
        b.is_markit        AS "isMarkit",
        b.created_at       AS "createdAt",
        b.invoice_number   AS "invoiceNumber",
        b.subtotal,
        b.discount,
        b.tax,
        b.grand_total      AS "grandTotal",
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
              'rate', e.rate,
              'qty', e.qty,
              'discount', e.discount,
              'tax', e.tax,
              'value', e.value
            )
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'
        ) AS entries,

        ${invoiceMatchSelect},
        COUNT(*) OVER() AS total_count

      FROM bills b
      LEFT JOIN clients c ON c.id = b.client_id
      LEFT JOIN entries e ON e.bill_id = b.id
      LEFT JOIN categories cat ON cat.id = e.category_id

      WHERE ${whereSQL}

      GROUP BY b.id, c.id

      ORDER BY ${orderByPrefix}${orderByColumn} ${orderByDirection}
      LIMIT $${idx} OFFSET $${idx + 1}
    `

    /* 📊 TOTALS QUERY — same WHERE, all pages */
    const totalsValues = [...values]
    const totalsQuery = `
      SELECT
        COALESCE(SUM(b.grand_total), 0)                                                   AS total,
        COALESCE(SUM(b.grand_total) FILTER (WHERE b.payment_method = 'Cash'), 0)          AS cash,
        COALESCE(SUM(b.grand_total) FILTER (WHERE b.payment_method = 'Card'), 0)          AS card,
        COALESCE(SUM(b.grand_total) FILTER (WHERE b.payment_method = 'UPI'), 0)           AS upi,
        COALESCE(SUM(b.grand_total) FILTER (WHERE b.payment_method = 'Credit'), 0)        AS credit
      FROM bills b
      LEFT JOIN clients c ON c.id = b.client_id
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
