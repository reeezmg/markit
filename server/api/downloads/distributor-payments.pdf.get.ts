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

    /* ── PDF ── */
    const doc    = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
    const MARGIN = 14
    let y        = MARGIN

    /* title */
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Distributor Payments', MARGIN, y)
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Period: ${startDate.toLocaleDateString('en-GB')} – ${endDate.toLocaleDateString('en-GB')}`, MARGIN, y)
    y += 5
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}   Total rows: ${rows.length}`, MARGIN, y)
    y += 8

    /* totals summary */
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0)

    autoTable(doc, {
      startY: y,
      head: [['Total Payments', 'Total Amount']],
      body: [[rows.length, rs(totalAmount)]],
      theme: 'grid',
      headStyles:  { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      bodyStyles:  { fontStyle: 'bold' },
      styles:      { fontSize: 9 },
    })

    y = (doc as any).lastAutoTable.finalY + 8

    /* main table */
    autoTable(doc, {
      startY: y,
      head: [['Payment No', 'Date', 'Distributor', 'PO No', 'Payment Type', 'Amount (Rs)', 'Remarks']],
      body: rows.length
        ? rows.map(r => [
            r.payment_no ?? '-',
            new Date(r.created_at).toLocaleDateString('en-GB'),
            r.distributor_name,
            r.purchase_order_no,
            r.payment_type ?? '-',
            rs(r.amount),
            r.remarks,
          ])
        : [['No data', '', '', '', '', '', '']],
      theme: 'striped',
      headStyles:  { fillColor: [39, 174, 96], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 248, 240] },
      styles:      { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 24 },
        2: { cellWidth: 45 },
        3: { cellWidth: 22 },
        4: { cellWidth: 28 },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 60 },
      },
    })

    const pdf = Buffer.from(doc.output('arraybuffer'))
    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(event, 'Content-Disposition', `attachment; filename="distributor-payments.pdf"`)
    return pdf

  } finally {
    client.release()
  }
})

function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`
}
