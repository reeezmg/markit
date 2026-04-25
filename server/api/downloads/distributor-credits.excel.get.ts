import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import ExcelJS from 'exceljs'

type RowType = 'PURCHASE' | 'CREDIT' | 'PAYMENT' | 'PURCHASE RETURN'

type Row = {
  created_at: Date
  type: RowType
  no: string | null
  debit: number
  credit: number
  remarks: string | null
}

export default defineEventHandler(async (event) => {

  /* ── AUTH ── */
  const session = await useAuthSession(event)
  const companyId = session.data.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  /* ── PARAMS ── */
  const query = getQuery(event)
  const distributorId = query.distributorId as string
  if (!distributorId) throw createError({ statusCode: 400, statusMessage: 'distributorId required' })

  const hasStart = !!query.startDate
  const hasEnd   = !!query.endDate
  const startDate  = hasStart ? new Date(query.startDate as string) : new Date(0)
  const endDate    = hasEnd   ? new Date(query.endDate   as string) : new Date()
  const typeFilter = (query.type as string || 'ALL').trim().toUpperCase()

  const client = await pool.connect()
  try {

    /* ── DISTRIBUTOR + OPENING DUE ── */
    const distRes  = await client.query(`SELECT name FROM distributors WHERE id = $1`, [distributorId])
    const distName = distRes.rows[0]?.name || 'Distributor'

    const dcRes = await client.query(
      `SELECT opening_due, opening_due_date
         FROM distributor_companies
        WHERE distributor_id = $1 AND company_id = $2`,
      [distributorId, companyId]
    )
    const openingDueBase = Number(dcRes.rows[0]?.opening_due || 0)

    /* ── CREDITS ── */
    const creditsRes = await client.query(
      `SELECT
         dc.credit_no,
         dc.created_at,
         dc.amount,
         dc.remarks,
         dc.purchase_order_id,
         po.purchase_order_no
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
         dp.payment_no,
         dp.created_at,
         dp.payment_type,
         dp.amount,
         dp.remarks,
         dp.purchase_return_id,
         pr.return_no
       FROM distributor_payments dp
       LEFT JOIN purchase_returns pr ON pr.id = dp.purchase_return_id
       WHERE dp.company_id    = $1
         AND dp.distributor_id = $2
         AND dp.created_at    BETWEEN $3 AND $4`,
      [companyId, distributorId, startDate, endDate]
    )

    const credits: Row[]  = creditsRes.rows.map(r => {
      const isPurchase = !!r.purchase_order_id
      return {
        created_at: r.created_at,
        type: (isPurchase ? 'PURCHASE' : 'CREDIT') as RowType,
        no: isPurchase
          ? (r.purchase_order_no != null ? `PO-${r.purchase_order_no}` : null)
          : (r.credit_no != null ? `DC-${r.credit_no}` : null),
        debit: 0,
        credit: Number(r.amount),
        remarks: r.remarks,
      }
    })

    const payments: Row[] = paymentsRes.rows.map(r => {
      const isReturn = r.payment_type === 'RETURN'
      return {
        created_at: r.created_at,
        type: (isReturn ? 'PURCHASE RETURN' : 'PAYMENT') as RowType,
        no: isReturn
          ? (r.return_no != null ? `PR-${r.return_no}` : null)
          : (r.payment_no != null ? `DP-${r.payment_no}` : null),
        debit: Number(r.amount),
        credit: 0,
        remarks: r.remarks,
      }
    })

    let rows: Row[] = [...credits, ...payments].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    if (typeFilter !== 'ALL') {
      rows = rows.filter(r => r.type === typeFilter)
    }

    /* ── OPENING BALANCE ── */
    let openingBalance = openingDueBase
    if (hasStart) {
      const before = await client.query(
        `SELECT
           COALESCE((SELECT SUM(amount) FROM distributor_credits
                     WHERE company_id = $1 AND distributor_id = $2 AND created_at < $3), 0) AS credits_before,
           COALESCE((SELECT SUM(amount) FROM distributor_payments
                     WHERE company_id = $1 AND distributor_id = $2 AND created_at < $3), 0) AS payments_before`,
        [companyId, distributorId, startDate]
      )
      openingBalance = openingDueBase + Number(before.rows[0].credits_before) - Number(before.rows[0].payments_before)
    }

    const totalDebit  = rows.reduce((s, r) => s + r.debit,  0)
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0)
    const closingBalance = openingBalance + totalCredit - totalDebit

    /* ── EXCEL ── */
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Markit'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Transactions')

    /* title */
    const titleRow = sheet.addRow([`Transactions — ${distName}`])
    titleRow.font = { bold: true, size: 14 }
    sheet.mergeCells('A1:F1')

    const periodLabel = hasStart || hasEnd
      ? `${startDate.toLocaleDateString('en-GB')} – ${endDate.toLocaleDateString('en-GB')}`
      : 'All time'
    sheet.addRow([periodLabel])
    sheet.mergeCells('A2:F2')
    sheet.addRow([])

    /* header */
    const headerRow = sheet.addRow(['Date', 'No', 'Type', 'Remarks', 'Debit (Rs)', 'Credit (Rs)'])
    headerRow.font = { bold: true }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAE3F3' } }
    headerRow.eachCell(cell => { cell.border = { bottom: { style: 'thin' } } })

    /* data */
    rows.forEach(r => {
      const row = sheet.addRow([
        new Date(r.created_at).toLocaleDateString('en-GB'),
        r.no ?? '-',
        r.type,
        r.remarks ?? '-',
        r.debit > 0 ? r.debit.toFixed(2) : '',
        r.credit > 0 ? r.credit.toFixed(2) : '',
      ])
      // row background: green for credit rows, red for debit rows
      if (r.credit > 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }
        })
        row.getCell(6).font = { color: { argb: 'FF27AE60' }, bold: true }
      } else if (r.debit > 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDEBE9' } }
        })
        row.getCell(5).font = { color: { argb: 'FFC0392B' }, bold: true }
      }
    })

    /* footer: opening balance, totals, closing balance */
    sheet.addRow([])
    const footerHeader = sheet.addRow(['Opening Balance', 'Total Debit', 'Total Credit', 'Closing Balance (Due)'])
    footerHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    footerHeader.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2980B9' } }
      cell.alignment = { horizontal: 'center' }
    })

    const footerBody = sheet.addRow([
      rs(openingBalance),
      rs(totalDebit),
      rs(totalCredit),
      rs(closingBalance),
    ])
    footerBody.font = { bold: true }
    footerBody.eachCell(cell => { cell.alignment = { horizontal: 'center' } })

    sheet.columns.forEach(col => { col.width = 22 })

    const buffer = await workbook.xlsx.writeBuffer()
    setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'Content-Disposition', `attachment; filename="transactions-${distName.replace(/\s+/g, '-')}.xlsx"`)
    return Buffer.from(buffer)

  } finally {
    client.release()
  }
})

function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`
}
