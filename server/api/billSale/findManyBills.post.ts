import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

const SORT_COLUMN_MAP: Record<string, string> = {
  invoiceNumber: 'b.invoice_number',
  createdAt: 'b.created_at',
  grandTotal: 'b.grand_total',
  paymentStatus: 'b.payment_status',
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const {
    companyId,
    search,
    selectedStatus,
    startDate,
    endDate,
    page = 1,
    pageCount = 5,
    sortColumn = 'invoiceNumber',
    sortDirection = 'desc',
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
    `

    /* 🔎 SEARCH RULES */
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
          whereSQL += `
            AND (
              b.invoice_number = $${idx}
              OR c.phone ILIKE $${idx + 1}
            )
          `
          values.push(Number(normalizedSearch), `%${normalizedSearch}%`)
          idx += 2
        }
      }
    }

    /* 💳 Payment status */
    if (selectedStatus?.length) {
      whereSQL += ` AND b.payment_status::text = ANY($${idx}::text[])`
      values.push(selectedStatus.map((s: any) => s.value))
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
        b.created_at       AS "createdAt",
        b.invoice_number   AS "invoiceNumber",
        b.subtotal,
        b.discount,
        b.tax,
        b.grand_total      AS "grandTotal",
        b.payment_status   AS "paymentStatus",
        b.payment_method   AS "paymentMethod",
        b.notes,

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

        COUNT(*) OVER() AS total_count

      FROM bills b
      LEFT JOIN clients c ON c.id = b.client_id
      LEFT JOIN entries e ON e.bill_id = b.id
      LEFT JOIN categories cat ON cat.id = e.category_id

      WHERE ${whereSQL}

      GROUP BY b.id, c.id

      ORDER BY ${orderByColumn} ${orderByDirection}
      LIMIT $${idx} OFFSET $${idx + 1}
    `

    values.push(
      Number(pageCount),
      (Number(page) - 1) * Number(pageCount)
    )

    const res = await client.query(query, values)

    return {
      rows: res.rows.map(({ total_count, ...row }) => row),
      total: res.rows[0]?.total_count ?? 0,
    }
  } finally {
    client.release()
  }
})
