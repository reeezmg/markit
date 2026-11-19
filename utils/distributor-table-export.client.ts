export type DistributorTableReport = {
  title: string;
  supplier: string;
  company?: string;
  period: string;
  columns: { label: string; numeric?: boolean; width?: number }[];
  rows: (string | number | null)[][];
  summary: { label: string; value: number }[];
  note?: string;
};

const amount = (value: number) => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function createDistributorTableExcel(report: DistributorTableReport) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  book.creator = 'Markit'; book.created = new Date();
  const info = book.addWorksheet('Report information');
  info.columns = [{ width: 36 }, { width: 95 }];
  const metadata = [
    ['Report', report.title], ['Company', report.company || ''], ['Distributor', report.supplier], ['Period', report.period],
    ['Currency', 'INR'], ['Rows', report.rows.length],
    ...report.summary.map(item => [item.label, item.value]),
    ...(report.note ? [['Balance basis', report.note]] : []),
    ['Generated', new Date().toLocaleString('en-IN')],
  ];
  for (const values of metadata) {
    const row = info.addRow(values); row.getCell(1).font = { bold: true };
    row.alignment = { vertical: 'top', wrapText: true };
  }
  const sheet = book.addWorksheet('Transactions', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = report.columns.map(column => ({ header: column.label, width: column.width || (column.numeric ? 21 : 28) }));
  for (const values of report.rows) sheet.addRow(values);
  report.columns.forEach((column, index) => {
    if (column.numeric) sheet.getColumn(index + 1).numFmt = '#,##0.00';
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: report.columns.length } };
  sheet.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; });
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172D48' } };
  return book.xlsx.writeBuffer();
}

export async function createDistributorTablePdf(report: DistributorTableReport) {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFillColor(23, 45, 72); doc.rect(0, 0, 297, 43, 'F');
  doc.setTextColor(194, 211, 229); doc.setFontSize(9);
  doc.text(doc.splitTextToSize(report.company || 'DISTRIBUTOR STATEMENT', 260).slice(0, 1), 14, 11);
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(21);
  doc.text(report.title, 14, 23);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(194, 211, 229);
  doc.text(doc.splitTextToSize(report.supplier, 160).slice(0, 1), 14, 36);
  doc.setFontSize(8); doc.text('STATEMENT PERIOD', 283, 16, { align: 'right' });
  doc.setTextColor(255, 255, 255); doc.setFontSize(11);
  doc.text(report.period, 283, 24, { align: 'right' });
  const cardWidth = 269 / Math.max(report.summary.length, 1);
  report.summary.forEach((item, index) => {
    const x = 14 + index * cardWidth, dark = index === report.summary.length - 1;
    doc.setFillColor(...(dark ? [23, 45, 72] : [241, 245, 249]) as [number, number, number]);
    doc.roundedRect(x, 49, cardWidth - 4, 23, 2, 2, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(...(dark ? [194, 211, 229] : [88, 106, 126]) as [number, number, number]);
    doc.text(item.label.toUpperCase(), x + 4, 56);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    const value = amount(item.value);
    if (doc.getTextWidth(value) > cardWidth - 12) doc.setFontSize(9);
    doc.setTextColor(...(dark ? [255, 255, 255] : [23, 45, 72]) as [number, number, number]);
    doc.text(value, x + 4, 65);
  });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text(`${report.rows.length} rows | Amounts in INR`, 14, 80);
  if (report.note) { doc.setFontSize(7); doc.text(report.note, 283, 80, { align: 'right' }); }
  autoTable(doc, {
    startY: 84, margin: { top: 23, bottom: 17, left: 14, right: 14 },
    head: [report.columns.map(column => column.label)],
    body: report.rows.map(row => row.map((value, index) => report.columns[index]?.numeric && typeof value === 'number' ? amount(value) : value ?? '-')),
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak', textColor: [48, 65, 84], lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [23, 45, 72], textColor: 255, fontSize: 7.5 },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: Object.fromEntries(report.columns.map((column, index) => [index, column.numeric ? { halign: 'right' } : {}])),
  });
  const pages = doc.getNumberOfPages(), generated = new Date().toLocaleString('en-IN');
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(88, 106, 126);
    if (page > 1) {
      doc.text(doc.splitTextToSize(`${report.supplier} | ${report.title}`, 170)[0], 14, 12);
      doc.text(report.period, 283, 12, { align: 'right' });
    }
    doc.setDrawColor(226, 232, 240); doc.line(14, 197, 283, 197);
    doc.setFontSize(7); doc.text(`Generated ${generated}`, 14, 203);
    doc.text(`Page ${page} of ${pages}`, 283, 203, { align: 'right' });
  }
  return doc.output('arraybuffer');
}

export async function downloadDistributorTable(format: 'pdf' | 'excel', report: DistributorTableReport) {
  const bytes = format === 'pdf' ? await createDistributorTablePdf(report) : await createDistributorTableExcel(report);
  const blob = new Blob([bytes as BlobPart], { type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${report.supplier}-${report.title}`.replace(/[^a-z0-9_-]+/gi, '-') + (format === 'pdf' ? '.pdf' : '.xlsx');
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
