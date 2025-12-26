// utils/generate-sales-report-pdf.client.ts
import type { KpiItem, BillWithRelations, PdfReportMeta } from '~/types/dashboard'

export async function generateSalesReportPDF(
  kpis: KpiItem[],
  bills: BillWithRelations[],
  meta: PdfReportMeta,
  filename = 'sales-report.pdf'
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('PDF generation must run in browser')
  }

  try {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ])

    /* -----------------------------
       DOCUMENT SETUP
    ----------------------------- */
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm' })
    const PAGE_WIDTH = doc.internal.pageSize.width
    const PAGE_HEIGHT = doc.internal.pageSize.height
    const MARGIN = 14
    let cursorY = MARGIN

    /* -----------------------------
       HEADER
    ----------------------------- */
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(meta.reportTitle || 'Sales Report', MARGIN, cursorY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    cursorY += 8
    doc.text(`Company: ${meta.companyName}`, MARGIN, cursorY)
    doc.text(`Period: ${meta.dateRange}`, MARGIN, cursorY + 6)
    doc.text(`Generated on: ${formatDate(new Date())}`, MARGIN, cursorY + 12)
    cursorY += 22

    /* -----------------------------
       KPI TABLE
    ----------------------------- */
    autoTable(doc, {
      startY: cursorY,
      tableWidth: 'auto',
      head: [['KPI', 'Value']],
      body: kpis.map(k => [k.KPI, k.Value]),
      theme: 'grid',
      styles: {
        fontSize: 10,
        cellPadding: 4
      },
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: 255,
        fontStyle: 'bold'
      }
    })

    cursorY = (doc as any).lastAutoTable.finalY + 12

    /* -----------------------------
       BILLS TABLE (FULL WIDTH)
    ----------------------------- */
    autoTable(doc, {
      startY: cursorY,
      tableWidth: 'auto', // ✅ FULL WIDTH
      theme: 'grid',
      head: [[
        'Invoice',
        'Date',
        'Client',
        'Subtotal',
        'Tax',
        'Discount',
        'Total',
      ]],
      body: bills.map(b => [
        formatInvoice(b.invoiceNumber),
        formatDate(b.createdAt),
        truncate(b.client?.name || 'N/A', 18),
        formatCurrency(b.subtotal),
        b.tax,
        formatCurrency(b.discount),
        formatCurrency(b.grandTotal),
       
      ]),
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      headStyles: {
        fillColor: [100, 116, 139],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 22 },
        1: { halign: 'left', cellWidth: 18 },
        2: { halign: 'left', cellWidth: 30 },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'center', cellWidth: 18 }
      }
    })

    /* -----------------------------
       FOOTER (ALL PAGES)
    ----------------------------- */
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(
        `Page ${i} of ${pageCount}`,
        PAGE_WIDTH - MARGIN - 25,
        PAGE_HEIGHT - 8
      )
      doc.text(
        meta.companyName,
        MARGIN,
        PAGE_HEIGHT - 8
      )
    }

    /* -----------------------------
       SAVE PDF
    ----------------------------- */
    doc.save(filename)

  } catch (err) {
    console.error('PDF generation failed:', err)
    throw new Error('Failed to generate PDF')
  }
}

/* =================================
   HELPERS
================================= */

const CURRENCY_SYMBOL = 'Rs '

function formatCurrency(value?: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return `${CURRENCY_SYMBOL}${safe.toFixed(2)}`
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString()
}

function truncate(text: string, length = 15): string {
  return text.length > length ? text.slice(0, length) + '…' : text
}

function formatInvoice(invoice?: string | number): string {
  if (!invoice) return '-'
  return invoice.toString().slice(0, 8) + '…'
}
