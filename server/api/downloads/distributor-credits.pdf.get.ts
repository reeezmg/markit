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

  const startDate  = query.startDate ? new Date(query.startDate as string) : new Date(0)
  const endDate    = query.endDate   ? new Date(query.endDate   as string) : new Date()
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

    /* ── PDF ── */
    const doc    = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const MARGIN = 14
    let y        = MARGIN

    /* title */
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(`Credits & Payments — ${distName}`, MARGIN, y)
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Period: ${startDate.toLocaleDateString('en-GB')} – ${endDate.toLocaleDateString('en-GB')}`, MARGIN, y)
    y += 5
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}   Total rows: ${rows.length}`, MARGIN, y)
    y += 8

    /* summary box */
    const totalCredits  = credits.reduce((s, r) => s + r.amount, 0)
    const totalPayments = payments.reduce((s, r) => s + r.amount, 0)
    const netDue        = totalCredits - totalPayments

    autoTable(doc, {
      startY: y,
      head: [['Total Credits', 'Total Payments', 'Net Due']],
      body: [[rs(totalCredits), rs(totalPayments), rs(netDue)]],
      theme: 'grid',
      headStyles:  { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      bodyStyles:  { fontStyle: 'bold', halign: 'center' },
      styles:      { fontSize: 9 },
    })

    y = (doc as any).lastAutoTable.finalY + 8

    /* main table */
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Type', 'Amount (Rs)', 'Remarks', 'PO No', 'Bill No']],
      body: rows.length
        ? rows.map(r => [
            new Date(r.created_at).toLocaleDateString('en-GB'),
            r.type ?? '-',
            rs(r.amount),
            r.remarks ?? '-',
            r.pono ?? '-',
            r.billno ?? '-',
          ])
        : [['No data', '', '', '', '', '']],
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      styles: { fontSize: 8 },
      didParseCell: (data) => {
        /* color the Type and Amount cells based on row type */
        if (data.section === 'body' && rows[data.row.index]) {
          const rowType = rows[data.row.index].rowType
          if (data.column.index === 1 || data.column.index === 2) {
            const isReturn = rows[data.row.index].type === 'RETURN'
            data.cell.styles.textColor = rowType === 'CREDIT' ? [192, 57, 43] : isReturn ? [211, 84, 0] : [39, 174, 96]
          }
        }
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22 },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 50 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
      },
    })

    const pdf = Buffer.from(doc.output('arraybuffer'))
    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(event, 'Content-Disposition', `attachment; filename="credits-${distName.replace(/\s+/g, '-')}.pdf"`)
    return pdf

  } finally {
    client.release()
  }
})

function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`
}
