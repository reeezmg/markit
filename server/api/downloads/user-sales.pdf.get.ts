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

  const startDate     = query.startDate ? new Date(query.startDate as string) : new Date(0)
  const endDate       = query.endDate   ? new Date(query.endDate   as string) : new Date()
  const search        = (query.search as string || '').trim()
  const statusFilter  = (query.status         as string || '').split(',').map(s => s.trim()).filter(Boolean)
  const paymentFilter = (query.paymentMethods as string || '').split(',').map(s => s.trim()).filter(Boolean)
  const minValue      = query.minValue != null && query.minValue !== '' ? Number(query.minValue) : null
  const maxValue      = query.maxValue != null && query.maxValue !== '' ? Number(query.maxValue) : null

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

    /* ── PDF ── */
    const doc    = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
    const MARGIN = 14
    let y        = MARGIN

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(`Sales — ${userName}`, MARGIN, y)
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Period: ${startDate.toLocaleDateString('en-GB')} – ${endDate.toLocaleDateString('en-GB')}`, MARGIN, y)
    y += 5
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}   Total items: ${rows.length}`, MARGIN, y)
    y += 8

    const totalQty   = rows.reduce((s, r) => s + r.qty, 0)
    const totalValue = rows.reduce((s, r) => s + r.value, 0)

    autoTable(doc, {
      startY: y,
      head: [['Total Items', 'Total Qty', 'Total Value']],
      body: [[rows.length, totalQty, rs(totalValue)]],
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 9 },
    })

    y = (doc as any).lastAutoTable.finalY + 8

    autoTable(doc, {
      startY: y,
      head: [['Category', 'Product', 'Rate (Rs)', 'Qty', 'Value (Rs)', 'Return']],
      body: rows.length
        ? rows.map(r => [
            r.category_name,
            r.name || '-',
            rs(r.rate),
            r.qty,
            rs(r.value),
            r.return ? 'Yes' : '-',
          ])
        : [['No data', '', '', '', '', '']],
      theme: 'striped',
      headStyles: { fillColor: [39, 174, 96], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 248, 240] },
      styles: { fontSize: 8 },
      didParseCell: (data) => {
        if (data.section === 'body' && rows[data.row.index]?.return) {
          data.cell.styles.textColor = [192, 57, 43]
        }
      },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'center' },
      },
    })

    const pdf = Buffer.from(doc.output('arraybuffer'))
    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(event, 'Content-Disposition', `attachment; filename="sales-${userName.replace(/\s+/g, '-')}.pdf"`)
    return pdf

  } finally {
    client.release()
  }
})

function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`
}
