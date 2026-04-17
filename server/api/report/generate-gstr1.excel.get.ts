import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import ExcelJS from 'exceljs'

export default defineEventHandler(async (event) => {

  /* =====================================================
     AUTH
  ===================================================== */

  const session = await useAuthSession(event)
  const companyId = session.data.companyId
  const cleanup = session.data.cleanup ?? false
  const isTaxIncluded = session.data.isTaxIncluded ?? true

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  /* =====================================================
     DATE FILTER
  ===================================================== */

  const query = getQuery(event)

  const startDate = query.startDate
    ? new Date(query.startDate as string)
    : new Date(0)

  const endDate = query.endDate
    ? new Date(query.endDate as string)
    : new Date()

  const client = await pool.connect()

  try {

    const [kpiRes, rateRes, hsnRes] = await Promise.all([

      client.query(
        `
        SELECT
          COUNT(DISTINCT b.id) AS bill_count,
          CASE WHEN $4 = true
            THEN COALESCE(SUM(e.value * 100.0 / (100.0 + NULLIF(e.tax, 0))), 0)
            ELSE COALESCE(SUM(e.value), 0)
          END AS total_taxable_value,
          CASE WHEN $4 = true
            THEN COALESCE(SUM(e.value * COALESCE(e.tax, 0) / (100.0 + NULLIF(e.tax, 0))), 0)
            ELSE COALESCE(SUM(e.value * COALESCE(e.tax, 0) / 100.0), 0)
          END AS total_tax,
          COALESCE(SUM(b.grand_total), 0) AS total_invoice_value
        FROM entries e
        JOIN bills b ON b.id = e.bill_id
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3
          AND ($5 = true OR b.precedence IS NOT TRUE)
        `,
        [companyId, startDate, endDate, isTaxIncluded, cleanup]
      ),

      client.query(
        `
        SELECT
          COALESCE(e.tax, 0) AS tax_rate,
          CASE WHEN $4 = true
            THEN COALESCE(SUM(e.value * 100.0 / (100.0 + NULLIF(e.tax, 0))), 0)
            ELSE COALESCE(SUM(e.value), 0)
          END AS taxable_value,
          CASE WHEN $4 = true
            THEN COALESCE(SUM(e.value * COALESCE(e.tax, 0) / (100.0 + NULLIF(e.tax, 0))), 0)
            ELSE COALESCE(SUM(e.value * COALESCE(e.tax, 0) / 100.0), 0)
          END AS total_tax
        FROM entries e
        JOIN bills b ON b.id = e.bill_id
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3
          AND ($5 = true OR b.precedence IS NOT TRUE)
        GROUP BY COALESCE(e.tax, 0)
        ORDER BY COALESCE(e.tax, 0)
        `,
        [companyId, startDate, endDate, isTaxIncluded, cleanup]
      ),

      client.query(
        `
        SELECT
          COALESCE(c.hsn, 'N/A') AS hsn_code,
          COALESCE(c.name, 'Uncategorized') AS category_name,
          COALESCE(e.tax, 0) AS tax_rate,
          COALESCE(SUM(e.qty), 0) AS total_qty,
          CASE WHEN $4 = true
            THEN COALESCE(SUM(e.value * 100.0 / (100.0 + NULLIF(e.tax, 0))), 0)
            ELSE COALESCE(SUM(e.value), 0)
          END AS taxable_value,
          CASE WHEN $4 = true
            THEN COALESCE(SUM(e.value * COALESCE(e.tax, 0) / (100.0 + NULLIF(e.tax, 0))), 0)
            ELSE COALESCE(SUM(e.value * COALESCE(e.tax, 0) / 100.0), 0)
          END AS total_tax
        FROM entries e
        JOIN bills b ON b.id = e.bill_id
        LEFT JOIN categories c ON c.id = e.category_id
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3
          AND ($5 = true OR b.precedence IS NOT TRUE)
        GROUP BY c.hsn, c.name, COALESCE(e.tax, 0)
        ORDER BY c.name, COALESCE(e.tax, 0)
        `,
        [companyId, startDate, endDate, isTaxIncluded, cleanup]
      )

    ])

    /* =====================================================
       BUILD WORKBOOK
    ===================================================== */

    const workbook = new ExcelJS.Workbook()

    const fmt = (n: number) => Math.round(n * 100) / 100

    /* ---------- Sheet 1: Summary ---------- */

    const s1 = workbook.addWorksheet('Summary')
    s1.addRow(['GSTR-1 Report'])
    s1.addRow([`Period: ${startDate.toDateString()} to ${endDate.toDateString()}`])
    s1.addRow([])
    s1.addRow(['Metric', 'Value'])
    const kpi = kpiRes.rows[0]
    s1.addRow(['Total Bills', Number(kpi.bill_count || 0)])
    s1.addRow(['Total Taxable Value (₹)', fmt(Number(kpi.total_taxable_value || 0))])
    s1.addRow(['Total Tax (₹)', fmt(Number(kpi.total_tax || 0))])
    s1.addRow(['Total Invoice Value (₹)', fmt(Number(kpi.total_invoice_value || 0))])

    /* ---------- Sheet 2: Rate-wise Summary ---------- */

    const s2 = workbook.addWorksheet('Rate-wise Summary')
    s2.addRow(['Tax Rate (%)', 'Taxable Value (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Total Tax (₹)'])
    for (const r of rateRes.rows) {
      const tax = fmt(Number(r.total_tax || 0))
      s2.addRow([
        Number(r.tax_rate || 0),
        fmt(Number(r.taxable_value || 0)),
        fmt(tax / 2),
        fmt(tax / 2),
        0,
        tax
      ])
    }

    /* ---------- Sheet 3: HSN Summary ---------- */

    const s3 = workbook.addWorksheet('HSN Summary')
    s3.addRow(['HSN Code', 'Description', 'UOM', 'Total Qty', 'Taxable Value (₹)', 'Tax Rate (%)', 'CGST (₹)', 'SGST (₹)', 'Total Tax (₹)'])
    for (const r of hsnRes.rows) {
      const tax = fmt(Number(r.total_tax || 0))
      s3.addRow([
        r.hsn_code,
        r.category_name,
        'Nos',
        Number(r.total_qty || 0),
        fmt(Number(r.taxable_value || 0)),
        Number(r.tax_rate || 0),
        fmt(tax / 2),
        fmt(tax / 2),
        tax
      ])
    }

    workbook.worksheets.forEach(sheet => {
      sheet.columns.forEach(col => { col.width = 22 })
    })

    const buffer = await workbook.xlsx.writeBuffer()

    setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'Content-Disposition', 'attachment; filename="gstr1.xlsx"')

    return buffer

  } finally {
    client.release()
  }
})
