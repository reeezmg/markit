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

    const [outwardRes, itcRes] = await Promise.all([

      client.query(
        `
        SELECT
          CASE WHEN COALESCE(e.tax, 0) > 0 THEN 'taxable' ELSE 'nil' END AS supply_type,
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
        GROUP BY supply_type
        `,
        [companyId, startDate, endDate, isTaxIncluded, cleanup]
      ),

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
          AND pri.tax > 0
        `,
        [companyId, startDate, endDate]
      )

    ])

    /* =====================================================
       PROCESS DATA
    ===================================================== */

    const fmt = (n: number) => Math.round(n * 100) / 100

    const taxableRow = outwardRes.rows.find(r => r.supply_type === 'taxable')
    const nilRow = outwardRes.rows.find(r => r.supply_type === 'nil')
    const itcRow = itcRes.rows[0]

    const outwardTax = Number(taxableRow?.total_tax || 0)
    const outwardCgst = fmt(outwardTax / 2)
    const outwardSgst = fmt(outwardTax / 2)
    const outwardTaxableValue = fmt(Number(taxableRow?.taxable_value || 0))

    const totalItc = Number(itcRow.total_itc || 0)
    const itcCgst = fmt(totalItc / 2)
    const itcSgst = fmt(totalItc / 2)

    /* =====================================================
       BUILD WORKBOOK
    ===================================================== */

    const workbook = new ExcelJS.Workbook()

    /* ---------- Sheet 1: Table 3.1 - Outward ---------- */

    const s1 = workbook.addWorksheet('Table 3.1 - Outward')
    s1.addRow(['GSTR-3B — Table 3.1: Outward Taxable Supplies'])
    s1.addRow([`Period: ${startDate.toDateString()} to ${endDate.toDateString()}`])
    s1.addRow([])
    s1.addRow(['Description', 'Taxable Value (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Total Tax (₹)'])
    s1.addRow([
      'Outward taxable supplies (other than zero/nil rated)',
      outwardTaxableValue,
      outwardCgst,
      outwardSgst,
      0,
      fmt(outwardTax)
    ])
    s1.addRow([
      'Nil rated / Exempt supplies',
      fmt(Number(nilRow?.taxable_value || 0)),
      0, 0, 0, 0
    ])

    /* ---------- Sheet 2: Table 4 - ITC & Net Payable ---------- */

    const s2 = workbook.addWorksheet('Table 4 - ITC & Net Payable')
    s2.addRow(['GSTR-3B — Table 4: Input Tax Credit & Net Tax Payable'])
    s2.addRow([`Period: ${startDate.toDateString()} to ${endDate.toDateString()}`])
    s2.addRow([])
    s2.addRow(['Description', 'CGST (₹)', 'SGST (₹)', 'Total (₹)'])
    s2.addRow(['ITC Available (Inward Supplies)', itcCgst, itcSgst, fmt(totalItc)])
    s2.addRow([])
    s2.addRow(['Net Tax Payable'])
    s2.addRow(['Net CGST Payable', Math.max(0, fmt(outwardCgst - itcCgst))])
    s2.addRow(['Net SGST Payable', Math.max(0, fmt(outwardSgst - itcSgst))])

    workbook.worksheets.forEach(sheet => {
      sheet.columns.forEach(col => { col.width = 30 })
    })

    const buffer = await workbook.xlsx.writeBuffer()

    setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'Content-Disposition', 'attachment; filename="gstr3b.xlsx"')

    return buffer

  } finally {
    client.release()
  }
})
