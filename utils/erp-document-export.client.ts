export async function exportDocumentTable(
  format: 'pdf' | 'excel', title: string,
  columns: { key: string; label: string }[], rows: any[],
  value: (row: any, key: string) => string | number,
) {
  const headers = columns.map(column => column.label)
  const body = rows.map(row => columns.map(column => value(row, column.key)))
  const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  if (format === 'pdf') {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.text(title, 14, 16)
    autoTable(doc, { startY: 23, head: [headers], body, styles: { fontSize: 8 } })
    doc.save(`${filename}.pdf`)
  } else {
    const { default: ExcelJS } = await import('exceljs')
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet(title.slice(0, 31))
    sheet.addRow(headers)
    body.forEach(row => sheet.addRow(row))
    sheet.getRow(1).font = { bold: true }
    sheet.columns.forEach(column => { column.width = 22 })
    const buffer = await book.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `${filename}.xlsx`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
