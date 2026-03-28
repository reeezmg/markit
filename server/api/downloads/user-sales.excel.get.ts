import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import ExcelJS from 'exceljs'

export default defineEventHandler(async (event) => {

  /* ── AUTH ── */
  const session = await useAuthSession(event)
  const companyId = session.data.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  /* ── PARAMS ── */
  const query  = getQuery(event)
  const userId = query.userId as string
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'userId required' })

  const startDate      = query.startDate ? new Date(query.startDate as string) : new Date(0)
  const endDate        = query.endDate   ? new Date(query.endDate   as string) : new Date()
  const search         = (query.search         as string || '').trim()
  const statusFilter   = (query.status         as string || '').split(',').map(s => s.trim()).filter(Boolean)
  const paymentFilter  = (query.paymentMethods as string || '').split(',').map(s => s.trim()).filter(Boolean)
  const minValue       = query.minValue != null && query.minValue !== '' ? Number(query.minValue) : null
  const maxValue       = query.maxValue != null && query.maxValue !== '' ? Number(query.maxValue) : null

  const client = await pool.connect()
  try {

    /* ── USER NAME ── */
    const userRes  = await client.query(
      `SELECT cu.name FROM company_users cu WHERE cu.company_id = $1 AND cu.user_id = $2`,
      [companyId, userId]
    )
    const userName = userRes.rows[0]?.name || 'User'

    /* ── ENTRIES ── */
    const searchParam = search ? `%${search}%` : '%'
    const res = await client.query(
      `SELECT
         e.name,
         e.rate,
         e.qty,
         e.value,
         e.return,
         COALESCE(c.name, '-') AS category_name,
         b.created_at          AS bill_date,
         b.payment_method,
         b.payment_status
       FROM entries e
       JOIN bills b ON b.id = e.bill_id
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.company_id = $1
         AND e.user_id    = $2
         AND b.deleted    = false
         AND b.created_at BETWEEN $3 AND $4
         AND ($5 = '%' OR e.name ILIKE $5 OR c.name ILIKE $5)
       ORDER BY b.created_at DESC`,
      [companyId, userId, startDate, endDate, searchParam]
    )

    let rows = res.rows.map(r => ({
      ...r,
      rate:  Number(r.rate  || 0),
      qty:   Number(r.qty   || 0),
      value: Number(r.value || 0),
    }))

    if (statusFilter.length)  rows = rows.filter(r => statusFilter.includes(r.payment_status))
    if (paymentFilter.length) rows = rows.filter(r => paymentFilter.includes(r.payment_method))
    if (minValue !== null)    rows = rows.filter(r => r.value >= minValue)
    if (maxValue !== null)    rows = rows.filter(r => r.value <= maxValue)

    /* ── EXCEL ── */
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Markit'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Sales')

    const titleRow = sheet.addRow([`Sales — ${userName}`])
    titleRow.font = { bold: true, size: 14 }
    sheet.mergeCells('A1:F1')

    sheet.addRow([`${startDate.toLocaleDateString('en-GB')} – ${endDate.toLocaleDateString('en-GB')}`])
    sheet.mergeCells('A2:F2')
    sheet.addRow([])

    const headerRow = sheet.addRow(['Category', 'Product', 'Rate (Rs)', 'Qty', 'Value (Rs)', 'Return'])
    headerRow.font = { bold: true }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } }
    headerRow.eachCell(cell => { cell.border = { bottom: { style: 'thin' } } })

    rows.forEach(r => {
      const row = sheet.addRow([
        r.category_name,
        r.name || '-',
        r.rate.toFixed(2),
        r.qty,
        r.value.toFixed(2),
        r.return ? 'Yes' : 'No',
      ])
      if (r.return) row.font = { color: { argb: 'FFC0392B' } }
    })

    sheet.addRow([])
    const totalsRow = sheet.addRow([
      'Total',
      `${rows.length} items`,
      '',
      rows.reduce((s, r) => s + r.qty, 0),
      rows.reduce((s, r) => s + r.value, 0).toFixed(2),
      '',
    ])
    totalsRow.font = { bold: true }

    sheet.columns.forEach(col => { col.width = 22 })

    const buffer = await workbook.xlsx.writeBuffer()
    setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'Content-Disposition', `attachment; filename="sales-${userName.replace(/\s+/g, '-')}.xlsx"`)
    return Buffer.from(buffer)

  } finally {
    client.release()
  }
})
