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
  const minTotal          = query.minTotal !== undefined ? Number(query.minTotal) : null
  const maxTotal          = query.maxTotal !== undefined ? Number(query.maxTotal) : null

  const client = await pool.connect()
  try {

    /* ── PURCHASE ORDERS ── */
    const posRes = await client.query(
      `SELECT
         po.id,
         po.purchase_order_no,
         po.bill_no,
         po.created_at,
         po.payment_type,
         po.total_amount,
         d.name AS distributor_name,
         COALESCE((
           SELECT SUM(i.initial_qty)
           FROM   products p
           JOIN   variants v ON v.product_id = p.id
           JOIN   items    i ON i.variant_id = v.id
           WHERE  p.purchaseorder_id = po.id
         ), 0) AS qty,
         COALESCE((
           SELECT SUM(dp.amount)
           FROM   distributor_payments dp
           WHERE  dp.purchase_order_id = po.id
         ), 0) AS paid
       FROM purchase_orders po
       LEFT JOIN distributors d ON d.id = po.distributor_id
       WHERE po.company_id = $1
         AND po.created_at BETWEEN $2 AND $3
       ORDER BY po.created_at DESC`,
      [companyId, startDate, endDate]
    )

    let rows = posRes.rows.map(r => ({
      purchase_order_no: r.purchase_order_no,
      bill_no:           r.bill_no,
      created_at:        r.created_at,
      payment_type:      r.payment_type,
      total_amount:      Number(r.total_amount),
      distributor_name:  r.distributor_name || '-',
      qty:               Number(r.qty),
      paid:              Number(r.paid),
      due:               r.payment_type === 'CREDIT' ? Number(r.total_amount) - Number(r.paid) : null,
    }))

    /* ── CLIENT-SIDE FILTERS ── */
    if (search) {
      rows = rows.filter(r =>
        String(r.purchase_order_no ?? '').toLowerCase().includes(search) ||
        String(r.bill_no ?? '').toLowerCase().includes(search)
      )
    }
    if (paymentTypeFilter) rows = rows.filter(r => r.payment_type === paymentTypeFilter)
    if (minTotal !== null)  rows = rows.filter(r => r.total_amount >= minTotal)
    if (maxTotal !== null)  rows = rows.filter(r => r.total_amount <= maxTotal)

    /* ── EXCEL ── */
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Markit'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Purchase Orders')

    /* title */
    const titleRow = sheet.addRow(['Purchase Orders'])
    titleRow.font = { bold: true, size: 14 }
    sheet.mergeCells('A1:G1')

    sheet.addRow([`${startDate.toLocaleDateString('en-GB')} – ${endDate.toLocaleDateString('en-GB')}`])
    sheet.mergeCells('A2:G2')
    sheet.addRow([])

    /* header */
    const headerRow = sheet.addRow(['PO No', 'Date', 'Distributor', 'Payment Type', 'Total (Rs)', 'Qty', 'Due (Rs)'])
    headerRow.font = { bold: true }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } }
    headerRow.eachCell(cell => { cell.border = { bottom: { style: 'thin' } } })

    /* data */
    rows.forEach(r => {
      sheet.addRow([
        r.purchase_order_no ?? '-',
        new Date(r.created_at).toLocaleDateString('en-GB'),
        r.distributor_name,
        r.payment_type ?? '-',
        r.total_amount.toFixed(2),
        r.qty,
        r.due !== null ? r.due.toFixed(2) : '-',
      ])
    })

    /* totals */
    sheet.addRow([])
    const totalRow = sheet.addRow([
      'Total',
      '',
      '',
      `${rows.length} orders`,
      rows.reduce((s, r) => s + r.total_amount, 0).toFixed(2),
      rows.reduce((s, r) => s + r.qty, 0),
      rows.filter(r => r.due !== null).reduce((s, r) => s + (r.due ?? 0), 0).toFixed(2),
    ])
    totalRow.font = { bold: true }

    sheet.columns.forEach(col => { col.width = 20 })

    const buffer = await workbook.xlsx.writeBuffer()
    setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'Content-Disposition', `attachment; filename="purchase-orders.xlsx"`)
    return Buffer.from(buffer)

  } finally {
    client.release()
  }
})
