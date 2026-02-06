import {
  defineEventHandler,
  getQuery,
  createError,
  setHeader
} from 'h3'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export default defineEventHandler(async (event) => {

  /* =====================================================
     AUTH
  ===================================================== */
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  /* =====================================================
     SAFE DATE PARSE
  ===================================================== */

  const query = getQuery(event)

  function safeDate(d: any, fallback: Date) {
    if (!d || d === 'null' || d === 'undefined') {
      return fallback
    }

    try {
      if (typeof d === 'string' && d.startsWith('"')) {
        return new Date(JSON.parse(d))
      }

      const dt = new Date(d)
      return isNaN(dt.getTime()) ? fallback : dt
    } catch {
      return fallback
    }
  }

  const from = safeDate(query.from, new Date(0))
  const to = safeDate(query.to, new Date())

  /* =====================================================
     FETCH LEDGER API
  ===================================================== */

  const ledgerRes: any = await $fetch(
    '/api/accounts/primaryledger',
    {
      method: 'GET',
      params: {
        from: from.toISOString(),
        to: to.toISOString()
      },
      headers: event.headers
    }
  )

  const { bank, ledger, closingBalance } = ledgerRes

  /* =====================================================
     PDF INIT
  ===================================================== */

  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4'
  })

  const MARGIN = 14
  let y = MARGIN

  /* =====================================================
     TITLE
  ===================================================== */

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Primary Bank Ledger', MARGIN, y)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')

  y += 7

  doc.text(
    `From: ${from.toLocaleDateString()}  To: ${to.toLocaleDateString()}`,
    MARGIN,
    y
  )

  y += 5

  doc.text(
    `Generated: ${new Date().toLocaleString()}`,
    MARGIN,
    y
  )

  y += 10

  /* =====================================================
     BANK INFO
  ===================================================== */

  doc.setFontSize(13)
  doc.text('Bank Information', MARGIN, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Field', 'Value']],
    body: [
      ['Bank Name', bank.bankName],
      ['Account Holder', bank.accHolderName || '-'],
      ['Account No', bank.accountNo || '-'],
      ['IFSC', bank.ifsc || '-'],
      ['UPI ID', bank.upiId || '-'],
      ['Opening Balance', rs(bank.openingBalance)],
      ['Closing Balance', rs(closingBalance)]
    ],
    theme: 'grid'
  })

  y = doc.lastAutoTable.finalY + 8

  /* =====================================================
     LEDGER TABLE
  ===================================================== */

  doc.setFontSize(13)
  doc.text('Ledger', MARGIN, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [[
      'Date',
      'Source',
      'Description',
      'Debit',
      'Credit',
      'Running Balance'
    ]],
    body: ledger.map((r: any) => [
      new Date(r.date).toLocaleDateString(),
      r.source,
      
      // FIX DESCRIPTION
  String(r.description)
    .replace('→', '->')
    .replace('←', '<-'),

      rs(r.debit),
      rs(r.credit),
      rs(r.runningBalance)
    ]),
    styles: { fontSize: 8 },
    theme: 'grid'
  })

  /* =====================================================
     OUTPUT
  ===================================================== */

  const pdf = Buffer.from(doc.output('arraybuffer'))

  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(
    event,
    'Content-Disposition',
    'attachment; filename="bank-ledger.pdf"'
  )

  return pdf
})

function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`
}
