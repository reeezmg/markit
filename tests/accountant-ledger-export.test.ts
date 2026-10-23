import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { createLedgerExcel, createLedgerPdf, type LedgerExport } from '../utils/account-ledger-export.client';

const report: LedgerExport = {
  companyName: 'Ledger Test Company', account: { name: 'Primary Bank', code: 'BANK-01', accountType: 'BANK', currency: 'INR', bankName: 'Test Bank', accountNumber: '001234', routingNumber: 'TEST0001' },
  openingBalance: 1000, openingBalanceSide: 'DR', closingBalance: 1500, balanceSide: 'DR',
  filteredDebitTotal: 600, filteredCreditTotal: 100, total: 65,
  data: Array.from({ length: 65 }, (_, i) => ({ date: '2026-03-02T00:00:00', referenceNumber: `EXP-${i + 1}`, journalNumber: `J-${i + 1}`,
    transactionDetails: '', sourceNote: i ? 'Settlement processing fee\nSecond line of the source note' : '=SUM(A1:A2)', sourceParties: { distributor: { name: 'Example Supplier' } },
    type: 'Expense', debit: 0, credit: 5.90, balance: 994.10 - i * 5.90, balanceSide: 'DR', originalCurrency: 'INR', originalAmount: 5.90, exchangeRate: 1 })),
};
const filters = { from: '2026-03-01', to: '2026-03-31', search: 'processing', side: 'CREDIT', order: 'asc' };
const excel = await createLedgerExcel(report, filters);
const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(excel);
const info = loaded.getWorksheet('Account information')!, sheet = loaded.getWorksheet('Transactions')!;
assert.equal(sheet.rowCount, report.data.length + 1, 'Every matching row is exported, independent of UI pagination');
assert.equal(sheet.getRow(2).getCell(5).value, '=SUM(A1:A2)', 'Source text is stored as text rather than an Excel formula');
assert.equal(sheet.getRow(2).getCell(9).value, 5.90, 'Amounts remain numeric');
assert.equal(sheet.getRow(2).getCell(2).value, 'EXP-1');
assert.equal(sheet.getRow(2).getCell(4).value, '', 'Reference is not repeated as a description');
assert.equal(sheet.getRow(3).getCell(5).value, report.data[1]!.sourceNote, 'Multiline notes are preserved');
assert.equal(info.getRow(7).getCell(2).value, '001234', 'Leading zeroes in bank account numbers are preserved');
const information = new Map<string, unknown>();
info.eachRow(row => information.set(String(row.getCell(1).value), row.getCell(2).value));
assert.equal(information.get('Debits shown'), report.filteredDebitTotal);
assert.equal(information.get('Period'), '01 Mar 2026 to 31 Mar 2026');
for (const label of ['Search', 'Transaction type filter', 'Entry side filter', 'Minimum amount', 'Maximum amount', 'Order']) {
  assert.ok(!information.has(label), `${label} is not exported`);
}
const pdf = await createLedgerPdf(report, filters), text = Buffer.from(pdf).toString('latin1');
assert.ok(text.startsWith('%PDF-'));
assert.ok(text.includes('Primary Bank') && text.includes('EXP-65'));
assert.ok(text.includes('01 Mar 2026 to 31 Mar 2026'), 'Period remains prominent in PDF');
for (const label of ['Transaction type filter', 'Entry side filter', 'Minimum amount', 'Maximum amount', 'Matching transactions']) assert.ok(!text.includes(label));
assert.ok((text.match(/\/Type \/Page\b/g) || []).length > 1, 'Multi-page ledger is complete');
const empty = { ...report, total: 0, data: [], filteredDebitTotal: 0, filteredCreditTotal: 0 };
assert.ok((await createLedgerPdf(empty, {})).byteLength > 0, 'Empty periods still export account information');
mkdirSync('.cache/accountant-ledger-exports', { recursive: true });
writeFileSync('.cache/accountant-ledger-exports/ledger.pdf', Buffer.from(pdf));
writeFileSync('.cache/accountant-ledger-exports/ledger.xlsx', Buffer.from(excel));
console.log('PDF/Excel passed: period and account/balance information, no filter metadata, all rows, numeric amounts, source notes, multipage PDF and empty periods.');
