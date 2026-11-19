import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { createDistributorTableExcel, createDistributorTablePdf, type DistributorTableReport } from '../utils/distributor-table-export.client';

const report: DistributorTableReport = {
  title: 'Accounts', company: 'Export Test Company', supplier: 'Export Test Supplier', period: '01 Oct 2026 to 23 Oct 2026',
  columns: [{ label: 'Date' }, { label: 'Reference' }, { label: 'Description', width: 50 },
    { label: 'Debit (INR)', numeric: true }, { label: 'Credit (INR)', numeric: true }, { label: 'Running due (INR)', numeric: true }],
  rows: Array.from({ length: 65 }, (_, i) => ['01 Oct 2026', `DP-${i + 1}`, i === 0 ? '=SUM(A1:A2)' : 'Payment note\nSecond line', 5.9, 0, 1000 - (i + 1) * 5.9]),
  summary: [{ label: 'Opening due before period', value: 1000 }, { label: 'Debits shown', value: 383.5 },
    { label: 'Credits shown', value: 0 }, { label: 'Closing due through end date', value: 616.5 }],
  note: 'Opening and closing dues reflect all posted transactions in the period, regardless of search or type filters.',
};
const excel = await createDistributorTableExcel(report);
const book = new ExcelJS.Workbook(); await book.xlsx.load(excel);
const sheet = book.getWorksheet('Transactions')!;
assert.equal(sheet.rowCount, 66, 'Exports every row across UI pages');
assert.equal(sheet.getRow(2).getCell(3).value, '=SUM(A1:A2)', 'User text remains text, not a spreadsheet formula');
assert.equal(sheet.getRow(3).getCell(3).value, 'Payment note\nSecond line');
assert.equal(sheet.getRow(2).getCell(4).value, 5.9, 'Amounts remain numeric');
assert.equal(sheet.getColumn(4).numFmt, '#,##0.00');
assert.equal(sheet.views[0]?.state, 'frozen');
const metadata = new Map<string, unknown>();
book.getWorksheet('Report information')!.eachRow(row => metadata.set(String(row.getCell(1).value), row.getCell(2).value));
assert.equal(metadata.get('Company'), report.company);
assert.equal(metadata.get('Distributor'), report.supplier);
assert.equal(metadata.get('Period'), report.period);
assert.equal(metadata.get('Closing due through end date'), 616.5);
assert.equal(metadata.get('Balance basis'), report.note);
const pdf = await createDistributorTablePdf(report), text = Buffer.from(pdf).toString('latin1');
assert.ok(text.startsWith('%PDF-'));
for (const value of [report.company!, report.supplier, report.period, 'DP-65', '616.50']) assert.ok(text.includes(value), `PDF contains ${value}`);
assert.ok((text.match(/\/Type \/Page\b/g) || []).length > 1, 'Long statements span multiple pages');
for (const title of ['Purchase Orders', 'Purchase Returns', 'Payments', 'PO-1 Payments']) {
  const other = { ...report, title, columns: [{ label: 'Reference' }, { label: 'Due (INR)', numeric: true }], rows: [['000123', null], ['Last row', -25.5]] };
  const output = new ExcelJS.Workbook(); await output.xlsx.load(await createDistributorTableExcel(other));
  assert.equal(output.getWorksheet('Transactions')!.getRow(2).getCell(1).value, '000123');
  assert.equal(output.getWorksheet('Transactions')!.getRow(2).getCell(2).value, null, 'Unknown due remains blank');
  assert.equal(output.getWorksheet('Transactions')!.getRow(3).getCell(2).value, -25.5);
  const bytes = await createDistributorTablePdf(other);
  assert.ok(Buffer.from(bytes).toString('latin1').includes(title));
}
mkdirSync('.cache/distributor-exports', { recursive: true });
writeFileSync('.cache/distributor-exports/accounts.pdf', Buffer.from(pdf));
writeFileSync('.cache/distributor-exports/accounts.xlsx', Buffer.from(excel));
console.log('Distributor exports passed: complete multipage PDF, styled Excel, metadata, numeric amounts, literal text and nullable due.');
