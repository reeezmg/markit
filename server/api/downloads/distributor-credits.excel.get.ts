import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import ExcelJS from 'exceljs'

export default defineEventHandler(async (event) => {

  /* ── AUTH ── */
  const session = await useAuthSession(event)
  const companyId = session.data.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  /* ── PARAMS ── */
  const query = getQuery(event)
  const distributorId = query.distributorId as string
  if (!distributorId) throw createError({ statusCode: 400, statusMessage: 'distributorId required' })

  const startDate = query.startDate ? new Date(query.startDate as string) : new Date(0)
  const endDate   = query.endDate   ? new Date(query.endDate   as string) : new Date()
  const typeFilter = (query.type as string || 'ALL').trim().toUpperCase()

  const client = await pool.connect()
  try {

    /* ── DISTRIBUTOR NAME ── */
    const distRes  = await client.query(`SELECT name FROM distributors WHERE id = $1`, [distributorId])
    const distName = distRes.rows[0]?.name || 'Distributor'

    /* ── CREDITS ── */
    const creditsRes = await client.query(
      `SELECT
         dc.created_at,
         dc.amount,
         dc.remarks,
         dc."billNo"            AS bill_no,
         po.purchase_order_no,
         po.bill_no             AS po_bill_no
       FROM distributor_credits dc
       LEFT JOIN purchase_orders po ON po.id = dc.purchase_order_id
       WHERE dc.company_id    = $1
         AND dc.distributor_id = $2
         AND dc.created_at    BETWEEN $3 AND $4`,
      [companyId, distributorId, startDate, endDate]
    )

    /* ── PAYMENTS ── */
    const paymentsRes = await client.query(
      `SELECT
         dp.created_at,
         dp.payment_type        AS type,
         dp.amount,
         dp.remarks,
         dp.bill_no,
         po.purchase_order_no,
         po.bill_no             AS po_bill_no
       FROM distributor_payments dp
       LEFT JOIN purchase_orders po ON po.id = dp.purchase_order_id
       WHERE dp.company_id    = $1
         AND dp.distributor_id = $2
         AND dp.created_at    BETWEEN $3 AND $4`,
      [companyId, distributorId, startDate, endDate]
    )

    type Row = {
      created_at: Date
      type: string
      rowType: 'CREDIT' | 'PAYMENT'
      amount: number
      remarks: string | null
      pono: string | null
      billno: string | null
    }

    const credits: Row[]  = creditsRes.rows.map(r => ({
      created_at: r.created_at,
      type:       'CREDIT',
      rowType:    'CREDIT' as const,
      amount:     Number(r.amount),
      remarks:    r.remarks,
      pono:       r.purchase_order_no ? String(r.purchase_order_no) : null,
      billno:     r.po_bill_no ?? r.bill_no ?? null,
    }))

    const payments: Row[] = paymentsRes.rows.map(r => ({
      created_at: r.created_at,
      type:       r.type,
      rowType:    'PAYMENT' as const,
      amount:     Number(r.amount),
      remarks:    r.remarks,
      pono:       r.purchase_order_no ? String(r.purchase_order_no) : null,
      billno:     r.bill_no ?? r.po_bill_no ?? null,
    }))

    let rows: Row[] = [...credits, ...payments].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    if (typeFilter === 'CREDIT')  rows = rows.filter(r => r.rowType === 'CREDIT')
    if (typeFilter === 'PAYMENT') rows = rows.filter(r => r.rowType === 'PAYMENT')

    /* ── EXCEL ── */
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Markit'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Transactions')

    /* title */
    const titleRow = sheet.addRow([`Credits & Payments — ${distName}`])
    titleRow.font = { bold: true, size: 14 }
    sheet.mergeCells('A1:F1')

    sheet.addRow([`${startDate.toLocaleDateString('en-GB')} – ${endDate.toLocaleDateString('en-GB')}`])
    sheet.mergeCells('A2:F2')
    sheet.addRow([])

    /* header */
    const headerRow = sheet.addRow(['Date', 'Type', 'Amount (Rs)', 'Remarks', 'PO No', 'Bill No'])
    headerRow.font = { bold: true }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAE3F3' } }
    headerRow.eachCell(cell => { cell.border = { bottom: { style: 'thin' } } })

    /* data */
    rows.forEach(r => {
      const row = sheet.addRow([
        new Date(r.created_at).toLocaleDateString('en-GB'),
        r.type ?? '-',
        r.amount.toFixed(2),
        r.remarks ?? '-',
        r.pono ?? '-',
        r.billno ?? '-',
      ])
      /* color credit rows red, return rows orange, payment rows green */
      const typeColor = r.rowType === 'CREDIT' ? 'FFC0392B' : r.type === 'RETURN' ? 'FFD35400' : 'FF27AE60'
      row.getCell(2).font = { color: { argb: typeColor } }
      row.getCell(3).font = { color: { argb: typeColor } }
    })

    /* totals */
    sheet.addRow([])
    const totalCredits  = credits.reduce((s, r) => s + r.amount, 0)
    const totalPayments = payments.reduce((s, r) => s + r.amount, 0)
    const totalRow = sheet.addRow(['Total Credits', rs(totalCredits), 'Total Payments', rs(totalPayments), `Net Due: ${rs(totalCredits - totalPayments)}`])
    totalRow.font = { bold: true }

    sheet.columns.forEach(col => { col.width = 22 })

    const buffer = await workbook.xlsx.writeBuffer()
    setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'Content-Disposition', `attachment; filename="credits-${distName.replace(/\s+/g, '-')}.xlsx"`)
    return Buffer.from(buffer)

  } finally {
    client.release()
  }
})

function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`
}
