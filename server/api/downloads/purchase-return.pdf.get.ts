import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const BLUE  = [31, 73, 125] as [number, number, number]   // dark navy
const WHITE = [255, 255, 255] as [number, number, number]
const LIGHT = [220, 230, 241] as [number, number, number] // light blue row

export default defineEventHandler(async (event) => {

  /* ── AUTH ── */
  const session = await useAuthSession(event)
  const companyId = session.data.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  /* ── PARAMS ── */
  const query = getQuery(event)
  const purchaseReturnId = query.purchaseReturnId as string
  if (!purchaseReturnId) throw createError({ statusCode: 400, statusMessage: 'purchaseReturnId required' })

  const client = await pool.connect()
  try {

    /* ── Company ── */
    const compRes = await client.query(
      `SELECT c.name, c.phone, c.gstin,
              a.street, a.locality, a.city, a.state, a.pincode
       FROM companies c
       LEFT JOIN addresses a ON a.id = (
         SELECT id FROM addresses WHERE company_id = c.id LIMIT 1
       )
       WHERE c.id = $1`,
      [companyId]
    )
    const co = compRes.rows[0] ?? {}

    /* ── Return header + distributor ── */
    const headerRes = await client.query(
      `SELECT
         pr.id,
         pr.return_no,
         pr.created_at,
         pr.subtotal_amount,
         pr.tax_amount,
         pr.total_amount,
         pr.remarks,
         po.purchase_order_no,
         po.bill_no AS po_bill_no,
         d.name     AS dist_name,
         d.gstin    AS dist_gstin,
         d.acc_holder_name,
         a.street   AS dist_street,
         a.locality AS dist_locality,
         a.city     AS dist_city,
         a.state    AS dist_state,
         a.pincode  AS dist_pincode
       FROM purchase_returns pr
       LEFT JOIN purchase_orders po ON po.id = pr.purchase_order_id
       JOIN distributors d          ON d.id  = pr.distributor_id
       LEFT JOIN addresses a        ON a.id  = (
         SELECT id FROM addresses WHERE distributor_id = d.id LIMIT 1
       )
       WHERE pr.id = $1
         AND pr.company_id = $2`,
      [purchaseReturnId, companyId]
    )
    if (headerRes.rows.length === 0)
      throw createError({ statusCode: 404, statusMessage: 'Purchase return not found' })

    const h = headerRes.rows[0]

    /* ── Items ── */
    const itemsRes = await client.query(
      `SELECT product_name, barcode, size, qty, rate, tax, tax_amount, subtotal, reason
       FROM purchase_return_items
       WHERE purchase_return_id = $1
       ORDER BY created_at`,
      [purchaseReturnId]
    )

    /* ── PDF ── */
    const doc    = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const PW     = 210 // page width
    const M      = 14  // margin
    const RW     = PW - M * 2 // 182mm usable

    /* ───────────────────────────────────────────────
       TOP SECTION: Company (left) | Title (right)
    ─────────────────────────────────────────────── */
    let y = 14

    // Company name
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(BLUE[0], BLUE[1], BLUE[2])
    doc.text(co.name || 'Company', M, y)

    // "PURCHASE RETURN" title top-right
    doc.setFontSize(22)
    doc.text('PURCHASE RETURN', PW - M, y, { align: 'right' })

    y += 6

    // Company address lines (left)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 60)

    const coLines: string[] = []
    if (co.street)   coLines.push(co.street)
    if (co.locality) coLines.push(co.locality)
    const coCity = [co.city, co.state, co.pincode].filter(Boolean).join(', ')
    if (coCity)      coLines.push(coCity)
    if (co.phone)    coLines.push(`Phone: ${co.phone}`)
    if (co.gstin)    coLines.push(`GSTIN: ${co.gstin}`)

    for (const line of coLines) {
      doc.text(line, M, y)
      y += 4.5
    }

    // Meta box (right): Date / Return ID / PO No
    const metaTop = 20
    const metaRows = [
      ['DATE',      new Date(h.created_at).toLocaleDateString('en-GB')],
      ['RETURN #',  String(h.return_no ?? '-')],
      ...(h.purchase_order_no ? [['PO NO', `#${h.purchase_order_no}`]] : []),
    ]

    autoTable(doc, {
      startY: metaTop,
      margin: { left: PW - M - 70 },
      tableWidth: 70,
      head: [],
      body: metaRows,
      theme: 'plain',
      styles: { fontSize: 9 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 28, textColor: [80, 80, 80] },
        1: { cellWidth: 42, fillColor: LIGHT, fontStyle: 'bold', textColor: [0, 0, 0] },
      },
    })

    y = Math.max(y, (doc as any).lastAutoTable.finalY + 6)
    y += 4

    /* ───────────────────────────────────────────────
       BILL TO (distributor)
    ─────────────────────────────────────────────── */
    // Section header bar
    doc.setFillColor(BLUE[0], BLUE[1], BLUE[2])
    doc.rect(M, y, 80, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text('RETURN TO', M + 3, y + 4.8)
    y += 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(40, 40, 40)

    const distLines: string[] = [h.dist_name]
    if (h.dist_street)   distLines.push(h.dist_street)
    if (h.dist_locality) distLines.push(h.dist_locality)
    const distCity = [h.dist_city, h.dist_state, h.dist_pincode].filter(Boolean).join(', ')
    if (distCity)        distLines.push(distCity)
    if (h.dist_gstin)    distLines.push(`GSTIN: ${h.dist_gstin}`)

    for (const line of distLines) {
      doc.text(line, M, y)
      y += 4.5
    }
    y += 4

    /* ───────────────────────────────────────────────
       ITEMS TABLE
    ─────────────────────────────────────────────── */
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['DESCRIPTION', 'SIZE', 'QTY', 'RATE', 'TAX %', 'TAX AMT', 'AMOUNT']],
      body: itemsRes.rows.length
        ? itemsRes.rows.map(r => [
            `${r.product_name}${r.barcode ? '\n' + r.barcode : ''}${r.reason ? '\n' + r.reason : ''}`,
            r.size ?? '-',
            r.qty,
            rs(Number(r.rate)),
            `${Number(r.tax)}%`,
            rs(Number(r.tax_amount)),
            rs(Number(r.subtotal)),
          ])
        : [['No items', '', '', '', '', '', '']],
      theme: 'striped',
      headStyles:         { fillColor: BLUE, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [240, 245, 252] },
      styles:             { fontSize: 8.5, valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 14, halign: 'center' },
        2: { cellWidth: 10, halign: 'center' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
      },
    })

    y = (doc as any).lastAutoTable.finalY + 6

    /* ───────────────────────────────────────────────
       TOTALS (bottom-right) + COMMENTS (bottom-left)
    ─────────────────────────────────────────────── */
    const totalsLeft = PW - M - 70
    const totalsData = [
      ['Subtotal',    rs(Number(h.subtotal_amount))],
      ['Tax',         rs(Number(h.tax_amount))],
    ]

    autoTable(doc, {
      startY: y,
      margin: { left: totalsLeft },
      tableWidth: 70,
      head: [],
      body: totalsData,
      theme: 'plain',
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 30, textColor: [80, 80, 80] },
        1: { cellWidth: 40, halign: 'right' },
      },
    })

    const totalsEndY = (doc as any).lastAutoTable.finalY

    // Grand Total row with blue background
    autoTable(doc, {
      startY: totalsEndY,
      margin: { left: totalsLeft },
      tableWidth: 70,
      head: [],
      body: [['TOTAL', rs(Number(h.total_amount))]],
      theme: 'plain',
      styles: { fontSize: 11, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 30, fillColor: BLUE, textColor: WHITE },
        1: { cellWidth: 40, halign: 'right', fillColor: BLUE, textColor: WHITE },
      },
    })

    // Remarks / Other comments (left side)
    if (h.remarks) {
      const remY = y
      doc.setFillColor(BLUE[0], BLUE[1], BLUE[2])
      doc.rect(M, remY, 90, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(255, 255, 255)
      doc.text('REMARKS', M + 3, remY + 4.8)

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(40, 40, 40)
      const remLines = doc.splitTextToSize(h.remarks, 84)
      doc.text(remLines, M + 3, remY + 11)
    }

    /* ───────────────────────────────────────────────
       FOOTER
    ─────────────────────────────────────────────── */
    const footerY = (doc as any).lastAutoTable.finalY + 12
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('Thank You For Your Business!', PW / 2, footerY, { align: 'center' })

    /* ── SEND ── */
    const pdf = Buffer.from(doc.output('arraybuffer'))
    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(event, 'Content-Disposition', `attachment; filename="return-${h.return_no ?? purchaseReturnId.slice(0, 8)}.pdf"`)
    return pdf

  } finally {
    client.release()
  }
})

function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`
}
