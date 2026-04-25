import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

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
         e.expense_number,
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

    /* ── PDF ── */
    const doc    = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const MARGIN = 14
    let y        = MARGIN

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(`Expenses — ${userName}`, MARGIN, y)
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Period: ${startDate.toLocaleDateString('en-GB')} – ${endDate.toLocaleDateString('en-GB')}`, MARGIN, y)
    y += 5
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}   Total expenses: ${rows.length}`, MARGIN, y)
    y += 8

    const totalAmount = rows.reduce((s, r) => s + r.total_amount, 0)

    autoTable(doc, {
      startY: y,
      head: [['Total Expenses', 'Total Amount']],
      body: [[rows.length, rs(totalAmount)]],
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 9 },
    })

    y = (doc as any).lastAutoTable.finalY + 8

    const expPrefix = session.data.expensePrefix || 'EXP'

    autoTable(doc, {
      startY: y,
      head: [['#', 'Date', 'Category', 'Note', 'Payment', 'Amount (Rs)', 'Status']],
      body: rows.length
        ? rows.map(r => {
            const numStr = r.expense_number ? `${expPrefix}-${r.expense_number}` : '-'
            return [
              numStr,
              new Date(r.expense_date).toLocaleDateString('en-GB'),
              r.category,
              r.note || '-',
              r.payment_mode || '-',
              rs(r.total_amount),
              r.status || '-',
            ]
          })
        : [['No data', '', '', '', '', '', '']],
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 22 },
        5: { halign: 'right', cellWidth: 26 },
        6: { cellWidth: 20 },
      },
    })

    const pdf = Buffer.from(doc.output('arraybuffer'))
    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(event, 'Content-Disposition', `attachment; filename="expenses-${userName.replace(/\s+/g, '-')}.pdf"`)
    return pdf

  } finally {
    client.release()
  }
})

function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`
}
