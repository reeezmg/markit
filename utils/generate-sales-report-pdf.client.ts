// utils/generate-sales-report-pdf.client.ts
import type { KpiItem, BillWithRelations, PdfReportMeta } from '~/types/dashboard'

export async function generateSalesReportPDF(
  kpis: KpiItem[],
  bills: BillWithRelations[],
  meta: PdfReportMeta,
  filename = 'sales-report.pdf'
): Promise<void> {
  // Strict environment check
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PDF generation is only available in browser environments')
  }

  try {
    // Dynamic imports for client-side only libraries
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ])

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm'
    })

    // --- Document Setup ---
    const margin = 14
    let currentY = margin

    // --- Logo & Header ---
    if (meta.logoUrl) {
      try {
        const image = await loadImageBase64(meta.logoUrl)
        if (image) {
          doc.addImage(image, 'PNG', doc.internal.pageSize.width - margin - 40, currentY, 40, 15)
        }
      } catch (e) {
        console.warn('Failed to load logo:', e)
      }
    }

    // --- Title Section ---
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(meta.reportTitle || 'Sales Report', margin, currentY + 10)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    currentY += 15
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, currentY)
    doc.text(`Company: ${meta.companyName}`, margin, currentY + 6)
    doc.text(`Period: ${meta.dateRange}`, margin, currentY + 12)
    currentY += 20

    // --- KPI Table ---
    autoTable(doc, {
      startY: currentY,
      head: [['KPI', 'Value']],
      body: kpis.map(kpi => [kpi.KPI, kpi.Value]),
      headStyles: { fillColor: [79, 70, 229] }, // Indigo
      styles: { fontSize: 10 }
    })
    currentY = (doc as any).lastAutoTable.finalY + 10
    function formatName(name: string): string {
      return name.length > 15 ? name.substring(0, 15) + '...' : name
    }
    // --- Bills Table ---
    autoTable(doc, {
      startY: currentY,
      head: [[
        'Invoice', 'Date', 'Client', 'Subtotal', 
        'Tax', 'Discount', 'Total', 'Status'
      ]],
      body: bills.map(b => [
        b.invoiceNumber?.toString().substring(0, 8) + '...' || '-',
        new Date(b.createdAt).toLocaleDateString(),
        b.client?.name ? formatName(b.client.name) : 'N/A',
        `₹${(b.subtotal ?? 0).toFixed(2)}`,
        `₹${(b.tax ?? 0).toFixed(2)}`,
        `₹${(b.discount ?? 0).toFixed(2)}`,
        `₹${(b.grandTotal ?? 0).toFixed(2)}`,
        b.paymentStatus
      ]),
      headStyles: { fillColor: [100, 116, 139] }, // Slate
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 20 }, // Invoice
        1: { cellWidth: 15 }, // Date
        2: { cellWidth: 25 }, // Client
        3: { cellWidth: 15 }, // Subtotal
        4: { cellWidth: 15 }, // Tax
        5: { cellWidth: 15 }, // Discount
        6: { cellWidth: 15 }, // Total
        7: { cellWidth: 15 }  // Status
      }
    })
    currentY = (doc as any).lastAutoTable.finalY + 10

    // --- Customer Summary Section ---
    const customerTotals: Record<string, number> = {}
    bills.forEach(b => {
      const name = b.client?.name ?? 'Unknown'
      const total = b.grandTotal ?? 0
      customerTotals[name] = (customerTotals[name] || 0) + total
    })

    const customerSummary = Object.entries(customerTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, total]) => [name, `₹${total.toFixed(2)}`])

    if (customerSummary.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [['Top Customers', 'Total Spent']],
        body: customerSummary,
        headStyles: { fillColor: [34, 197, 94] }, // Green
        styles: { fontSize: 10 }
      })
      currentY = (doc as any).lastAutoTable.finalY + 10
    }

    // --- Footer ---
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - margin - 20, doc.internal.pageSize.height - 10)
      doc.text(meta.companyName, margin, doc.internal.pageSize.height - 10)
    }

    // Save the PDF
    doc.save(filename)
  } catch (error) {
    console.error('PDF generation failed:', error)
    throw new Error('Failed to generate PDF document')
  }
}

async function loadImageBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await convertBlobToBase64(blob)
  } catch (e) {
    console.error('Logo load failed', e)
    return null
  }
}

function convertBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}