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

  const startDate = query.startDate ? new Date(query.startDate as string) : new Date(0)
  const endDate   = query.endDate   ? new Date(query.endDate   as string) : new Date()
  const search    = (query.search as string || '').trim()

  /* optional multi-value filters passed as comma-separated strings */
  const statusFilter      = (query.status       as string || '').split(',').map(s => s.trim()).filter(Boolean)
  const categoryFilter    = (query.category     as string || '').split(',').map(s => s.trim()).filter(Boolean)
  const paymentModeFilter = (query.paymentModes as string || '').split(',').map(s => s.trim()).filter(Boolean)
  const minAmount         = query.minAmount != null && query.minAmount !== '' ? Number(query.minAmount) : null
  const maxAmount         = query.maxAmount != null && query.maxAmount !== '' ? Number(query.maxAmount) : null

  const client = await pool.connect()
  try {

    /* ── USER NAME ── */
    const userRes  = await client.query(
      `SELECT cu.name FROM company_users cu WHERE cu.company_id = $1 AND cu.user_id = $2`,
      [companyId, userId]
    )
    const userName = userRes.rows[0]?.name || 'User'

    /* ── EXPENSES ── */
    const searchParam = search ? `%${search}%` : '%'
    const res = await client.query(
      `SELECT
         e.expense_date,
         COALESCE(ec.name, '-') AS category,
         e.note,
         e.payment_mode,
         e.total_amount,
         e.status
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
       WHERE e.company_id   = $1
         AND e.from_id      = $2
         AND e.expense_date BETWEEN $3 AND $4
         AND ($5 = '%' OR e.note ILIKE $5 OR ec.name ILIKE $5)
       ORDER BY e.expense_date DESC`,
      [companyId, userId, startDate, endDate, searchParam]
    )

    let rows = res.rows.map(r => ({ ...r, total_amount: Number(r.total_amount || 0) }))

    if (statusFilter.length)      rows = rows.filter(r => statusFilter.includes(r.status))
    if (categoryFilter.length)    rows = rows.filter(r => categoryFilter.includes(r.category))
    if (paymentModeFilter.length) rows = rows.filter(r => paymentModeFilter.includes(r.payment_mode))
    if (minAmount !== null)       rows = rows.filter(r => r.total_amount >= minAmount)
    if (maxAmount !== null)       rows = rows.filter(r => r.total_amount <= maxAmount)

    /* ── EXCEL ── */
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Markit'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Expenses')

    const titleRow = sheet.addRow([`Expenses — ${userName}`])
    titleRow.font = { bold: true, size: 14 }
    sheet.mergeCells('A1:F1')

    sheet.addRow([`${startDate.toLocaleDateString('en-GB')} – ${endDate.toLocaleDateString('en-GB')}`])
    sheet.mergeCells('A2:F2')
    sheet.addRow([])

    const headerRow = sheet.addRow(['Date', 'Category', 'Note', 'Payment', 'Amount (Rs)', 'Status'])
    headerRow.font = { bold: true }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAE3F3' } }
    headerRow.eachCell(cell => { cell.border = { bottom: { style: 'thin' } } })

    rows.forEach(r => {
      sheet.addRow([
        new Date(r.expense_date).toLocaleDateString('en-GB'),
        r.category,
        r.note || '-',
        r.payment_mode || '-',
        r.total_amount.toFixed(2),
        r.status || '-',
      ])
    })

    sheet.addRow([])
    const totalsRow = sheet.addRow([
      'Total',
      `${rows.length} expenses`,
      '',
      '',
      rows.reduce((s, r) => s + r.total_amount, 0).toFixed(2),
      '',
    ])
    totalsRow.font = { bold: true }

    sheet.columns.forEach(col => { col.width = 22 })

    const buffer = await workbook.xlsx.writeBuffer()
    setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'Content-Disposition', `attachment; filename="expenses-${userName.replace(/\s+/g, '-')}.xlsx"`)
    return Buffer.from(buffer)

  } finally {
    client.release()
  }
})
