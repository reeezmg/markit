type LedgerLine = {
  date: string; referenceNumber?: string; journalNumber: string; transactionDetails?: string;
  sourceNote?: string; sourceParties?: Record<string, { name?: string }>;
  type: string; debit: number; credit: number; balance: number; balanceSide: string;
  originalAmount: number; originalCurrency: string; exchangeRate: number;
};
export type LedgerExport = {
  companyName: string; account: { name: string; code?: string; accountType: string; currency: string;
    description?: string; bankName?: string; accountNumber?: string; routingNumber?: string };
  openingBalance: number; openingBalanceSide: string; closingBalance: number; balanceSide: string;
  filteredDebitTotal: number; filteredCreditTotal: number; total: number; data: LedgerLine[];
};
export type LedgerExportFilters = { from?: string; to?: string; search?: string; sourceType?: string;
  side?: string; minAmount?: number; maxAmount?: number; order?: string };

const date = (value: string) => new Date(value).toLocaleDateString('en-GB');
const amount = (value: number) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const period = (filters: LedgerExportFilters) => {
  const label = (value: string) => new Date(value + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (filters.from && filters.to) return `${label(filters.from)} to ${label(filters.to)}`;
  if (filters.from) return `From ${label(filters.from)}`;
  if (filters.to) return `Through ${label(filters.to)}`;
  return 'All dates';
};
function details(line: LedgerLine) {
  return [...new Set([line.transactionDetails, ...Object.values(line.sourceParties || {}).map(p => p?.name), line.sourceNote]
    .map(v => v?.trim()).filter(Boolean))].join('\n');
}
function metadata(ledger: LedgerExport, filters: LedgerExportFilters) {
  const a = ledger.account;
  return [
    ['Company', ledger.companyName], ['Account', a.name], ['Account code', a.code || ''],
    ['Account type', a.accountType.replaceAll('_', ' ')], ['Currency', a.currency],
    ['Bank', a.bankName || ''], ['Account number', a.accountNumber || ''], ['IFSC / routing number', a.routingNumber || ''],
    ['Description', a.description || ''], ['Period', period(filters)],
    ['Transactions', ledger.total], ['Opening balance before period', `${amount(ledger.openingBalance)} ${ledger.openingBalanceSide}`],
    ['Debits shown', ledger.filteredDebitTotal], ['Credits shown', ledger.filteredCreditTotal],
    ['Closing balance through end date', `${amount(ledger.closingBalance)} ${ledger.balanceSide}`],
    ['Balance basis', 'Opening and closing balances reflect all posted transactions.'],
    ['Generated', new Date().toLocaleString('en-IN')],
  ];
}

export async function createLedgerExcel(ledger: LedgerExport, filters: LedgerExportFilters) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook(); book.creator = ledger.companyName; book.created = new Date();
  const info = book.addWorksheet('Account information');
  info.columns = [{ width: 36 }, { width: 95 }];
  for (const pair of metadata(ledger, filters)) { const row = info.addRow(pair); row.getCell(1).font = { bold: true }; row.alignment = { vertical: 'top', wrapText: true }; }
  const sheet = book.addWorksheet('Transactions', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Date', key: 'date', width: 14 }, { header: 'Reference', key: 'reference', width: 28 },
    { header: 'Journal number', key: 'journal', width: 32 }, { header: 'Transaction details', key: 'details', width: 50 },
    { header: 'Source note', key: 'note', width: 60 }, { header: 'Parties', key: 'parties', width: 30 },
    { header: 'Type', key: 'type', width: 24 }, { header: `Debit (${ledger.account.currency})`, key: 'debit', width: 20 },
    { header: `Credit (${ledger.account.currency})`, key: 'credit', width: 20 }, { header: 'Running balance', key: 'balance', width: 22 },
    { header: 'Balance side', key: 'side', width: 14 }, { header: 'Original currency', key: 'originalCurrency', width: 18 },
    { header: 'Original amount', key: 'originalAmount', width: 20 }, { header: 'Exchange rate', key: 'rate', width: 18 },
  ];
  for (const line of ledger.data) sheet.addRow({ date: date(line.date), reference: line.referenceNumber || line.journalNumber,
    journal: line.journalNumber, details: line.transactionDetails || '', note: line.sourceNote || '',
    parties: Object.values(line.sourceParties || {}).map(p => p?.name).filter(Boolean).join('\n'), type: line.type,
    debit: Number(line.debit), credit: Number(line.credit), balance: Number(line.balance), side: line.balanceSide,
    originalCurrency: line.originalCurrency, originalAmount: Number(line.originalAmount), rate: Number(line.exchangeRate) });
  sheet.autoFilter = { from: 'A1', to: 'N1' };
  for (const name of ['debit', 'credit', 'balance', 'originalAmount']) sheet.getColumn(name).numFmt = '#,##0.00';
  sheet.getColumn('rate').numFmt = '0.000000';
  sheet.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; });
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  return book.xlsx.writeBuffer();
}

export async function createLedgerPdf(ledger: LedgerExport, filters: LedgerExportFilters) {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const a = ledger.account;
  doc.setFillColor(23, 45, 72); doc.rect(0, 0, 297, 43, 'F');
  doc.setTextColor(194, 211, 229); doc.setFontSize(9);
  doc.text(ledger.companyName || 'ACCOUNT LEDGER', 14, 11);
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(21);
  const nameLines = doc.splitTextToSize(a.name, 170);
  doc.text(nameLines.slice(0, 2), 14, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(194, 211, 229);
  doc.text(`Account ledger  |  ${a.currency}`, 14, 37);
  doc.setFontSize(8); doc.text('STATEMENT PERIOD', 283, 16, { align: 'right' });
  doc.setTextColor(255, 255, 255); doc.setFontSize(11);
  doc.text(period(filters), 283, 24, { align: 'right' });
  const accountRows: any[] = [
    ['Account type', a.accountType.replaceAll('_', ' '), 'Currency', a.currency],
    ...(a.bankName || a.accountNumber ? [['Bank', a.bankName || '-', 'Account number', a.accountNumber || '-']] : []),
    ...(a.routingNumber || a.code ? [['IFSC / routing', a.routingNumber || '-', 'Account code', a.code || '-']] : []),
    ...(a.description ? [['Description', { content: a.description, colSpan: 3 }]] : []),
  ];
  autoTable(doc, { startY: 48, margin: { left: 14, right: 14 }, theme: 'plain', body: accountRows,
    styles: { fontSize: 8, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 4 }, textColor: [48, 65, 84] },
    columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold' }, 1: { cellWidth: 102 }, 2: { cellWidth: 34, fontStyle: 'bold' }, 3: { cellWidth: 101 } } });
  const end = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 65;
  // Very long account descriptions can span pages; leave room for the summary.
  let summaryY = end + 6;
  if (summaryY > 159) { doc.addPage(); summaryY = 24; }
  const cards = [
    ['Opening balance', `${amount(ledger.openingBalance)} ${ledger.openingBalanceSide}`],
    ['Debits shown', amount(ledger.filteredDebitTotal)], ['Credits shown', amount(ledger.filteredCreditTotal)],
    ['Closing balance', `${amount(ledger.closingBalance)} ${ledger.balanceSide}`],
  ];
  cards.forEach(([label, value], i) => {
    const x = 14 + i * 68.25, dark = i === 3;
    doc.setFillColor(...(dark ? [23, 45, 72] : [241, 245, 249]) as [number, number, number]);
    doc.roundedRect(x, summaryY, 64.25, 23, 2, 2, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(...(dark ? [194, 211, 229] : [88, 106, 126]) as [number, number, number]);
    doc.text(label!.toUpperCase(), x + 4, summaryY + 7);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    if (doc.getTextWidth(value!) > 56) doc.setFontSize(9);
    doc.setTextColor(...(dark ? [255, 255, 255] : [23, 45, 72]) as [number, number, number]);
    doc.text(value!, x + 4, summaryY + 16);
  });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
  doc.text(`${ledger.total} transactions | Amounts in ${a.currency}`, 14, summaryY + 30);
  doc.text('Opening and closing balances reflect all posted transactions.', 283, summaryY + 30, { align: 'right' });
  autoTable(doc, { startY: summaryY + 34, margin: { top: 23, bottom: 17, left: 14, right: 14 },
    head: [['Date', 'Reference', 'Transaction details / source note', 'Type', `Debit (${ledger.account.currency})`, `Credit (${ledger.account.currency})`, 'Running balance']],
    body: ledger.data.map(line => [date(line.date), line.referenceNumber || line.journalNumber,
      details(line) + (line.originalCurrency !== ledger.account.currency ? `\nOriginal: ${line.originalCurrency} ${amount(line.originalAmount)}; rate ${line.exchangeRate}` : ''),
      line.type, line.debit ? amount(line.debit) : '', line.credit ? amount(line.credit) : '', `${amount(line.balance)} ${line.balanceSide}`]),
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak', textColor: [48, 65, 84], lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [23, 45, 72], textColor: 255, fontSize: 7.5 }, alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: { 0: { cellWidth: 21 }, 1: { cellWidth: 36 }, 2: { cellWidth: 86 }, 3: { cellWidth: 30 },
      4: { halign: 'right', cellWidth: 28 }, 5: { halign: 'right', cellWidth: 28 }, 6: { halign: 'right', cellWidth: 40, fontStyle: 'bold' } },
  });
  const pages = doc.getNumberOfPages();
  const generated = new Date().toLocaleString('en-IN');
  for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(88, 106, 126);
    if (page > 1) {
      doc.text(doc.splitTextToSize([ledger.companyName, a.name].filter(Boolean).join(' | '), 170)[0], 14, 12);
      doc.text(period(filters), 283, 12, { align: 'right' });
    }
    doc.setDrawColor(226, 232, 240); doc.line(14, 197, 283, 197);
    doc.setFontSize(7); doc.text(`Generated ${generated}`, 14, 203);
    doc.text(`Page ${page} of ${pages}`, 283, 203, { align: 'right' }); }
  return doc.output('arraybuffer');
}

export async function downloadAccountLedger(format: 'pdf' | 'excel', ledger: LedgerExport, filters: LedgerExportFilters) {
  const bytes = format === 'pdf' ? await createLedgerPdf(ledger, filters) : await createLedgerExcel(ledger, filters);
  const blob = new Blob([bytes as BlobPart], { type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${ledger.account.name.replace(/[^a-z0-9_-]+/gi, '-')}-ledger-${filters.from || 'beginning'}-${filters.to || 'latest'}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
