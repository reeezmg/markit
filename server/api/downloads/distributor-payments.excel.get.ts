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

  const startDate = query.startDate ? new Date(query.startDate as string) : new Date(0)
  const endDate   = query.endDate   ? new Date(query.endDate   as string) : new Date()

  const search            = (query.search as string || '').trim().toLowerCase()
  const paymentTypeFilter = (query.paymentType as string || '').trim()
  const distributorId     = (query.distributorId as string || '').trim() || null
  const excludeReturns    = query.excludeReturns === 'true'

  const client = await pool.connect()
  try {

    /* ── PAYMENTS ── */
    const paymentsRes = await client.query(
      `SELECT
         dp.payment_no,
         dp.created_at,
         dp.payment_type,
         dp.amount,
         dp.remarks,
         dp.bill_no,
         d.name AS distributor_name,
         po.purchase_order_no
       FROM distributor_payments dp
       LEFT JOIN distributors    d  ON d.id  = dp.distributor_id
       LEFT JOIN purchase_orders po ON po.id = dp.purchase_order_id
       WHERE dp.company_id = $1
         AND dp.created_at BETWEEN $2 AND $3
         AND ($4::text IS NULL OR dp.distributor_id = $4)
         AND (NOT $5::boolean OR dp.payment_type IS DISTINCT FROM 'RETURN')
       ORDER BY dp.created_at DESC`,
      [companyId, startDate, endDate, distributorId, excludeReturns]
    )

    let rows = paymentsRes.rows.map(r => ({
      payment_no:        r.payment_no,
      created_at:        r.created_at,
      payment_type:      r.payment_type,
      amount:            Number(r.amount),
      remarks:           r.remarks || '-',
      bill_no:           r.bill_no,
      distributor_name:  r.distributor_name || '-',
      purchase_order_no: r.purchase_order_no ?? '-',
    }))

    /* ── CLIENT-SIDE FILTERS ── */
    if (search) {
      rows = rows.filter(r =>
        String(r.payment_no ?? '').toLowerCase().includes(search) ||
        String(r.remarks ?? '').toLowerCase().includes(search) ||
        String(r.bill_no ?? '').toLowerCase().includes(search) ||
        String(r.distributor_name ?? '').toLowerCase().includes(search)
      )
    }
    if (paymentTypeFilter) rows = rows.filter(r => r.payment_type === paymentTypeFilter)

    /* ── EXCEL ── */
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Markit'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Distributor Payments')

    /* title */
    const titleRow = sheet.addRow(['Distributor Payments'])
    titleRow.font = { bold: true, size: 14 }
    sheet.mergeCells('A1:G1')

    sheet.addRow([`${startDate.toLocaleDateString('en-GB')} – ${endDate.toLocaleDateString('en-GB')}`])
    sheet.mergeCells('A2:G2')
    sheet.addRow([])

    /* header */
    const headerRow = sheet.addRow(['Payment No', 'Date', 'Distributor', 'PO No', 'Payment Type', 'Amount (Rs)', 'Remarks'])
    headerRow.font = { bold: true }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } }
    headerRow.eachCell(cell => { cell.border = { bottom: { style: 'thin' } } })

    /* data */
    rows.forEach(r => {
      sheet.addRow([
        r.payment_no ?? '-',
        new Date(r.created_at).toLocaleDateString('en-GB'),
        r.distributor_name,
        r.purchase_order_no,
        r.payment_type ?? '-',
        r.amount.toFixed(2),
        r.remarks,
      ])
    })

    /* totals */
    sheet.addRow([])
    const totalRow = sheet.addRow([
      'Total',
      '',
      '',
      '',
      `${rows.length} payments`,
      rows.reduce((s, r) => s + r.amount, 0).toFixed(2),
      '',
    ])
    totalRow.font = { bold: true }

    sheet.columns.forEach(col => { col.width = 20 })

    const buffer = await workbook.xlsx.writeBuffer()
    setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'Content-Disposition', `attachment; filename="distributor-payments.xlsx"`)
    return Buffer.from(buffer)

  } finally {
    client.release()
  }
})
