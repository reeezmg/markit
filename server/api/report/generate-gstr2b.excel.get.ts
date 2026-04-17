import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import ExcelJS from 'exceljs'

export default defineEventHandler(async (event) => {

  /* =====================================================
     AUTH
  ===================================================== */

  const session = await useAuthSession(event)
  const companyId = session.data.companyId

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

    const [kpiRes, rateRes, distRes] = await Promise.all([

      client.query(
        `
        SELECT
          COALESCE(SUM(pri.tax_amount), 0) AS total_itc,
          COALESCE(SUM(pri.subtotal), 0) AS taxable_value,
          COALESCE(SUM(pri.subtotal + pri.tax_amount), 0) AS total_inward_value
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
        WHERE pr.company_id = $1
          AND pr.created_at BETWEEN $2 AND $3
        `,
        [companyId, startDate, endDate]
      ),

      client.query(
        `
        SELECT
          COALESCE(pri.tax, 0) AS tax_rate,
          COALESCE(SUM(pri.subtotal), 0) AS taxable_value,
          COALESCE(SUM(pri.tax_amount), 0) AS total_tax
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
        WHERE pr.company_id = $1
          AND pr.created_at BETWEEN $2 AND $3
        GROUP BY COALESCE(pri.tax, 0)
        ORDER BY COALESCE(pri.tax, 0)
        `,
        [companyId, startDate, endDate]
      ),

      client.query(
        `
        SELECT
          COALESCE(d.name, 'Unknown') AS distributor_name,
          COUNT(DISTINCT pr.id) AS invoice_count,
          COALESCE(SUM(pri.subtotal), 0) AS taxable_value,
          COALESCE(SUM(pri.tax_amount), 0) AS total_tax
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
        LEFT JOIN distributors d ON d.id = pr.distributor_id
        WHERE pr.company_id = $1
          AND pr.created_at BETWEEN $2 AND $3
        GROUP BY d.id, d.name
        ORDER BY d.name
        `,
        [companyId, startDate, endDate]
      )

    ])

    /* =====================================================
       BUILD WORKBOOK
    ===================================================== */

    const fmt = (n: number) => Math.round(n * 100) / 100
    const workbook = new ExcelJS.Workbook()

    /* ---------- Sheet 1: Summary ---------- */

    const s1 = workbook.addWorksheet('Summary')
    s1.addRow(['GSTR-2B Report — Inward Supplies (ITC)'])
    s1.addRow([`Period: ${startDate.toDateString()} to ${endDate.toDateString()}`])
    s1.addRow([])
    const kpi = kpiRes.rows[0]
    const totalItc = Number(kpi.total_itc || 0)
    s1.addRow(['Metric', 'Value'])
    s1.addRow(['Total ITC Available (₹)', fmt(totalItc)])
    s1.addRow(['CGST ITC (₹)', fmt(totalItc / 2)])
    s1.addRow(['SGST ITC (₹)', fmt(totalItc / 2)])
    s1.addRow(['Total Taxable Value (₹)', fmt(Number(kpi.taxable_value || 0))])
    s1.addRow(['Total Inward Value (₹)', fmt(Number(kpi.total_inward_value || 0))])

    /* ---------- Sheet 2: Rate-wise ITC ---------- */

    const s2 = workbook.addWorksheet('Rate-wise ITC')
    s2.addRow(['Tax Rate (%)', 'Taxable Value (₹)', 'CGST (₹)', 'SGST (₹)', 'Total Tax (₹)'])
    for (const r of rateRes.rows) {
      const tax = fmt(Number(r.total_tax || 0))
      s2.addRow([
        Number(r.tax_rate || 0),
        fmt(Number(r.taxable_value || 0)),
        fmt(tax / 2),
        fmt(tax / 2),
        tax
      ])
    }

    /* ---------- Sheet 3: Distributor-wise ---------- */

    const s3 = workbook.addWorksheet('Distributor-wise')
    s3.addRow(['Distributor', 'Invoice Count', 'Taxable Value (₹)', 'CGST (₹)', 'SGST (₹)', 'Total Tax (₹)'])
    for (const r of distRes.rows) {
      const tax = fmt(Number(r.total_tax || 0))
      s3.addRow([
        r.distributor_name,
        Number(r.invoice_count || 0),
        fmt(Number(r.taxable_value || 0)),
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
    setHeader(event, 'Content-Disposition', 'attachment; filename="gstr2b.xlsx"')

    return buffer

  } finally {
    client.release()
  }
})
