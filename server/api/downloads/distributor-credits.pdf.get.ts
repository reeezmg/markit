import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

type RowType = 'PURCHASE' | 'CREDIT' | 'PAYMENT' | 'PURCHASE RETURN'

type Row = {
  created_at: Date
  type: RowType
  no: string | null
  debit: number
  credit: number
  remarks: string | null
}

export default defineEventHandler(async (event) => {

  /* ── AUTH ── */
  const session = await useAuthSession(event)
  const companyId = session.data.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  /* ── PARAMS ── */
  const query = getQuery(event)
  const distributorId = query.distributorId as string
  if (!distributorId) throw createError({ statusCode: 400, statusMessage: 'distributorId required' })

  const hasStart = !!query.startDate
  const hasEnd   = !!query.endDate
  const startDate  = hasStart ? new Date(query.startDate as string) : new Date(0)
  const endDate    = hasEnd   ? new Date(query.endDate   as string) : new Date()
  const typeFilter = (query.type as string || 'ALL').trim().toUpperCase()

  const client = await pool.connect()
  try {

    /* ── COMPANY (for header) ── */
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

    /* ── DISTRIBUTOR + OPENING DUE ── */
    const distRes = await client.query(
      `SELECT d.name, d.gstin, d.upi_id,
              a.street, a.locality, a.city, a.state, a.pincode
         FROM distributors d
         LEFT JOIN addresses a ON a.id = (
           SELECT id FROM addresses WHERE distributor_id = d.id LIMIT 1
         )
        WHERE d.id = $1`,
      [distributorId]
    )
    const dist     = distRes.rows[0] ?? {}
    const distName = dist.name || 'Distributor'

    const dcRes = await client.query(
      `SELECT opening_due, opening_due_date
         FROM distributor_companies
        WHERE distributor_id = $1 AND company_id = $2`,
      [distributorId, companyId]
    )
    const openingDueBase = Number(dcRes.rows[0]?.opening_due || 0)

    /* ── CREDITS (PURCHASE or CREDIT) ── */
    const creditsRes = await client.query(
      `SELECT
         dc.credit_no,
         dc.created_at,
         dc.amount,
         dc.remarks,
         dc.purchase_order_id,
         po.purchase_order_no
       FROM distributor_credits dc
       LEFT JOIN purchase_orders po ON po.id = dc.purchase_order_id
       WHERE dc.company_id    = $1
         AND dc.distributor_id = $2
         AND dc.created_at    BETWEEN $3 AND $4`,
      [companyId, distributorId, startDate, endDate]
    )

    /* ── PAYMENTS (PAYMENT or PURCHASE RETURN) ── */
    const paymentsRes = await client.query(
      `SELECT
         dp.payment_no,
         dp.created_at,
         dp.payment_type,
         dp.amount,
         dp.remarks,
         dp.purchase_return_id,
         pr.return_no
       FROM distributor_payments dp
       LEFT JOIN purchase_returns pr ON pr.id = dp.purchase_return_id
       WHERE dp.company_id    = $1
         AND dp.distributor_id = $2
         AND dp.created_at    BETWEEN $3 AND $4`,
      [companyId, distributorId, startDate, endDate]
    )

    const credits: Row[]  = creditsRes.rows.map(r => {
      const isPurchase = !!r.purchase_order_id
      return {
        created_at: r.created_at,
        type: (isPurchase ? 'PURCHASE' : 'CREDIT') as RowType,
        no: isPurchase
          ? (r.purchase_order_no != null ? `PO-${r.purchase_order_no}` : null)
          : (r.credit_no != null ? `DC-${r.credit_no}` : null),
        debit: 0,
        credit: Number(r.amount),
        remarks: r.remarks,
      }
    })

    const payments: Row[] = paymentsRes.rows.map(r => {
      const isReturn = r.payment_type === 'RETURN'
      return {
        created_at: r.created_at,
        type: (isReturn ? 'PURCHASE RETURN' : 'PAYMENT') as RowType,
        no: isReturn
          ? (r.return_no != null ? `PR-${r.return_no}` : null)
          : (r.payment_no != null ? `DP-${r.payment_no}` : null),
        debit: Number(r.amount),
        credit: 0,
        remarks: r.remarks,
      }
    })

    let rows: Row[] = [...credits, ...payments].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    if (typeFilter !== 'ALL') {
      rows = rows.filter(r => r.type === typeFilter)
    }

    /* ── OPENING BALANCE FOR WINDOW ── */
    // Opening = distributor opening_due + (credits - payments) that occurred strictly before startDate.
    let openingBalance = openingDueBase
    if (hasStart) {
      const before = await client.query(
        `SELECT
           COALESCE((SELECT SUM(amount) FROM distributor_credits
                     WHERE company_id = $1 AND distributor_id = $2 AND created_at < $3), 0) AS credits_before,
           COALESCE((SELECT SUM(amount) FROM distributor_payments
                     WHERE company_id = $1 AND distributor_id = $2 AND created_at < $3), 0) AS payments_before`,
        [companyId, distributorId, startDate]
      )
      openingBalance = openingDueBase + Number(before.rows[0].credits_before) - Number(before.rows[0].payments_before)
    }

    const totalDebit  = rows.reduce((s, r) => s + r.debit,  0)
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0)
    const closingBalance = openingBalance + totalCredit - totalDebit

    /* ── PDF ── */
    const doc    = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const PW     = 210
    const MARGIN = 14
    let y        = MARGIN

    /* TRANSACTIONS title (top center) */
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(41, 128, 185)
    doc.text('TRANSACTIONS', PW / 2, y, { align: 'center' })
    y += 8

    /* company name (left) */
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(0, 0, 0)
    doc.text(co.name || 'Company', MARGIN, y)
    y += 5

    /* company address lines (left) */
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
      doc.text(line, MARGIN, y)
      y += 4.5
    }

    y += 4

    /* distributor block — big name, small grey address */
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(0, 0, 0)
    doc.text(distName, MARGIN, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(120, 120, 120)

    const distLines: string[] = []
    if (dist.street)   distLines.push(dist.street)
    if (dist.locality) distLines.push(dist.locality)
    const distCity = [dist.city, dist.state, dist.pincode].filter(Boolean).join(', ')
    if (distCity)      distLines.push(distCity)
    if (dist.gstin)    distLines.push(`GSTIN: ${dist.gstin}`)

    for (const line of distLines) {
      doc.text(line, MARGIN, y)
      y += 4
    }

    y += 3

    /* period + generated meta (below distributor, small grey) */
    const fromLabel = hasStart ? startDate.toLocaleDateString('en-GB') : 'Beginning'
    const toLabel   = hasEnd   ? endDate.toLocaleDateString('en-GB')   : new Date().toLocaleDateString('en-GB')

    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(
      `PERIOD: ${fromLabel} – ${toLabel}    GENERATED: ${new Date().toLocaleString('en-GB')}`,
      MARGIN, y
    )
    y += 4

    doc.setTextColor(0, 0, 0)
    y += 4

    /* main table */
    autoTable(doc, {
      startY: y,
      head: [['Date', 'No', 'Type', 'Remarks', 'Debit (Rs)', 'Credit (Rs)']],
      body: rows.length
        ? rows.map(r => [
            new Date(r.created_at).toLocaleDateString('en-GB'),
            r.no ?? '-',
            r.type,
            r.remarks ?? '-',
            r.debit > 0 ? r.debit.toFixed(2) : '-',
            r.credit > 0 ? r.credit.toFixed(2) : '-',
          ])
        : [['No data', '', '', '', '', '']],
      theme: 'grid',
      headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8 },
      didParseCell: (data) => {
        if (data.section !== 'body' || !rows[data.row.index]) return
        const r = rows[data.row.index]
        // row background: green for credit rows, red for debit rows
        if (r.credit > 0) {
          data.cell.styles.fillColor = [232, 245, 233] // light green
        } else if (r.debit > 0) {
          data.cell.styles.fillColor = [253, 235, 233] // light red
        }
        // column-specific alignment
        if (data.column.index === 4) data.cell.styles.halign = 'right'
        if (data.column.index === 5) data.cell.styles.halign = 'right'
        // color amount text
        if (data.column.index === 4 && r.debit > 0)  data.cell.styles.textColor = [192, 57, 43]
        if (data.column.index === 5 && r.credit > 0) data.cell.styles.textColor = [39, 174, 96]
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22 },
        2: { cellWidth: 28 },
        3: { cellWidth: 50 },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 30, halign: 'right' },
      },
    })

    y = (doc as any).lastAutoTable.finalY + 6

    /* footer: opening balance, totals, closing balance */
    autoTable(doc, {
      startY: y,
      head: [['Opening Balance', 'Total Debit', 'Total Credit', 'Closing Balance (Due)']],
      body: [[
        rs(openingBalance),
        rs(totalDebit),
        rs(totalCredit),
        rs(closingBalance),
      ]],
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 9 },
    })

    const pdf = Buffer.from(doc.output('arraybuffer'))
    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(event, 'Content-Disposition', `attachment; filename="transactions-${distName.replace(/\s+/g, '-')}.pdf"`)
    return pdf

  } finally {
    client.release()
  }
})

function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`
}
