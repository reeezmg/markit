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
  const query = getQuery(event)
  const distributorId = query.distributorId as string
  if (!distributorId) throw createError({ statusCode: 400, statusMessage: 'distributorId required' })

  const startDate = query.startDate ? new Date(query.startDate as string) : new Date(0)
  const endDate   = query.endDate   ? new Date(query.endDate   as string) : new Date()

  const search            = (query.search as string || '').trim().toLowerCase()
  const paymentTypeFilter = (query.paymentType as string || '').trim()
  const dueOnly           = query.dueOnly === 'true'

  const client = await pool.connect()
  try {

    /* ── DISTRIBUTOR NAME ── */
    const distRes  = await client.query(`SELECT name FROM distributors WHERE id = $1`, [distributorId])
    const distName = distRes.rows[0]?.name || 'Distributor'

    /* ── PURCHASE ORDERS ── */
    const posRes = await client.query(
      `SELECT
         po.purchase_order_no,
         po.created_at,
         po.payment_type,
         po.total_amount,
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
       WHERE po.company_id    = $1
         AND po.distributor_id = $2
         AND po.created_at    BETWEEN $3 AND $4
       ORDER BY po.created_at DESC`,
      [companyId, distributorId, startDate, endDate]
    )

    let rows = posRes.rows.map(r => ({
      purchase_order_no: r.purchase_order_no,
      created_at:        r.created_at,
      payment_type:      r.payment_type,
      total_amount:      Number(r.total_amount),
      qty:               Number(r.qty),
      paid:              Number(r.paid),
      due:               r.payment_type === 'CREDIT' ? Number(r.total_amount) - Number(r.paid) : null,
    }))

    /* ── CLIENT-SIDE FILTERS ── */
    if (search)            rows = rows.filter(r => String(r.purchase_order_no ?? '').toLowerCase().includes(search))
    if (paymentTypeFilter) rows = rows.filter(r => r.payment_type === paymentTypeFilter)
    if (dueOnly)           rows = rows.filter(r => r.due !== null && r.due > 0)

    /* ── PDF ── */
    const doc    = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
    const MARGIN = 14
    let y        = MARGIN

    /* title */
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(`Purchase Orders — ${distName}`, MARGIN, y)
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Period: ${startDate.toLocaleDateString('en-GB')} – ${endDate.toLocaleDateString('en-GB')}`, MARGIN, y)
    y += 5
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}   Total rows: ${rows.length}`, MARGIN, y)
    y += 8

    /* totals summary */
    const totalAmount = rows.reduce((s, r) => s + r.total_amount, 0)
    const totalQty    = rows.reduce((s, r) => s + r.qty, 0)
    const totalDue    = rows.filter(r => r.due !== null).reduce((s, r) => s + (r.due ?? 0), 0)

    autoTable(doc, {
      startY: y,
      head: [['Total Orders', 'Total Amount', 'Total Qty', 'Total Due']],
      body: [[rows.length, rs(totalAmount), totalQty, rs(totalDue)]],
      theme: 'grid',
      headStyles:  { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      bodyStyles:  { fontStyle: 'bold' },
      styles:      { fontSize: 9 },
    })

    y = (doc as any).lastAutoTable.finalY + 8

    /* main table */
    autoTable(doc, {
      startY: y,
      head: [['PO No', 'Date', 'Payment Type', 'Total (Rs)', 'Qty', 'Due (Rs)']],
      body: rows.length
        ? rows.map(r => [
            r.purchase_order_no ?? '-',
            new Date(r.created_at).toLocaleDateString('en-GB'),
            r.payment_type ?? '-',
            rs(r.total_amount),
            r.qty,
            r.due !== null ? rs(r.due) : '-',
          ])
        : [['No data', '', '', '', '', '']],
      theme: 'striped',
      headStyles:  { fillColor: [39, 174, 96], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 248, 240] },
      styles:      { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 25 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 30, halign: 'right' },
      },
    })

    const pdf = Buffer.from(doc.output('arraybuffer'))
    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(event, 'Content-Disposition', `attachment; filename="po-${distName.replace(/\s+/g, '-')}.pdf"`)
    return pdf

  } finally {
    client.release()
  }
})

function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`
}
