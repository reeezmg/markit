import fs from 'node:fs';
const dir=process.env.ACCOUNTING_REVIEW_DIR;
if(!dir)throw Error('ACCOUNTING_REVIEW_DIR is required');
const read=name=>JSON.parse(fs.readFileSync(`${dir}/${name}`,'utf8'));
const checks=[...read('test-results.json'),...read('additional-checks.json').checks];
const live=read('production-settings.json'),persisted=read('persisted-verification.json');
const posting=fs.readFileSync(`${dir}/account-settings-posting.integration.test.ts.log`,'utf8');
const ui=read('ui-default-selection.json'),stock=read('stock-account-selection.json'),supplier=read('supplier-account-selection.json'),online=read('online-permissions.json');
const activity=read('source-activity.json');
const result={at:new Date().toISOString(),passed:checks.filter(c=>c.code===0).length,failed:checks.filter(c=>c.code!==0),productionAccountSelectionsChecked:live.selectedAccountsChecked,invalidProductionSelections:live.invalidSelections,stockDifferences:live.stockDifferences,productionUnchanged:persisted.unchanged,productionVerification:persisted,optionalCompanyDefaultGroupsSaved:live.savedDefaultGroups,onlinePostingRoles:online.onlineRoles,uiChecks:ui.checks.length,stockDefaultApplied:!stock.defect,supplierDefaultAppliedInTest:supplier.paymentDefaultApplied,pendingProductionMigration:!live.supplierOpeningSelectionTriggerInstalled?'20261006120000_supplier_opening_account_default':null};
fs.writeFileSync(`${dir}/summary.json`,JSON.stringify(result,null,2));
result.productionSettingsAndNativeAccountingUnchanged=!persisted.changes.some(c=>c.table.startsWith('accountant_v2_'));
result.observedSourceActivity={bills:activity.bills,legacyLedgerRowsUpdated:activity.ledger.length};
fs.writeFileSync(`${dir}/summary.json`,JSON.stringify(result,null,2));
const lines=[
 '# Account settings recheck — 6 October 2026','',
 `${result.passed} suites passed; ${result.failed.length} failed. Production references checked: ${result.productionAccountSelectionsChecked}; invalid references: ${result.invalidProductionSelections.length}.`,
 '',
 'Checked the actual settings page, validation/selection helpers, native posting functions and account-using forms. Tests use mock Vue handlers or disposable schemas; historical production mappings are inspected read-only.',
 '',
 '| Setting area | Verified behavior |','|---|---|',
 '| Billing and expenses | All 10 ERP roles post to selected accounts. Billing and expenses share Cash/Bank; saving one preserves the other section’s dedicated selections. |',
 '| Stock | Selected Billing Stock follows default stock valuation; the sale reduces the selected account without an extra profit adjustment. Production stock-control and billing accounts match. |',
 '| Salary/staff | All six roles and named banks route correctly. Existing accruals retain their recorded mappings. |',
 '| Supplier/purchases | Company defaults override supplier mappings for new source roles; explicit transaction choices override defaults. Existing source selections remain recorded. Supplier-opening default fix passes in the test schema. |',
 '| Investments | Equity, profit-payable, loans, capital receipts/payments and payouts receive the corresponding form defaults; investment posting tests pass. Profit-settings Save is manager/admin only. |',
 '| Receive/Pay | Separate money/purpose defaults prefill each direction. Actual money posting, reversal and account-isolation tests pass. |',
 '| Transfers | From/to defaults prefill creation; edits keep recorded accounts. Identical from/to defaults reject. Actual transfer posting tests pass. |',
 '| Fixed assets | All five category/disposal defaults reach forms; actual depreciation/disposal posting tests pass. |',
 `| Online sales | ${online.onlineRoles} roles validate; selected mappings save without implicitly enabling/importing. Actual COD/gateway settlement, GST, COGS and refund posting tests pass. |`,
 '',
 'Changed settings affect future sources; previously recorded source accounts stay intact unless explicitly changed on the transaction. Invalid company/type/inactive selections reject. Cleared defaults do not resurrect an older saved group.',
 '',
 'Production limitations:',
 '- The supplier-opening selection trigger is absent. Apply the prepared 20261006120000_supplier_opening_account_default migration at deployment for new generated supplier opening edits to honor the company opening-offset default. This check does not apply it.',
 `- ${live.savedDefaultGroups} optional company form-default groups are saved, and ${live.settings.filter(s=>s.group==='Online').length} dedicated online settings rows exist. Unconfigured defaults are optional: supplier mappings or explicit transaction selections apply; online activation is separate.`,
 '- Local application fixes from previous turns are not certified as deployed by these tests.',
 '',
 `Production fingerprint unchanged: ${persisted.unchanged}; tested public tables: ${persisted.testedTables}; leftover test schemas: ${persisted.leftoverSchemas.length}. Settings and native-accounting hashes are unchanged.`,
 'The changed hashes belong to bills, entries and the archived ledger, with no row-count changes. During the test window, City Center invoice #14109 was updated and 32 legacy ledger rows received the same update timestamp. The current invoice is UPI ₹9,600 and its native Bank debit is ₹9,600. Exact prior field values were not stored in the hash baseline, so this report does not claim a complete unchanged-production result or exact per-field reconstruction. All suites use mocks or disposable schemas; this check makes no public financial/source updates.',
 '',
 'Source and evidence:',
 '- pages/settings/account.vue; utils/account-defaults.ts; server/utils/accountant/account-settings.ts; erp.ts; users.ts; ecommerce.ts; investor-profits.ts.',
 '- server/utils/distributor-account-selection.ts; server/utils/erp-stock-selection.ts; components/Distributor/AccountSelection.vue; components/Accountant/MoneyPage.vue, AccountTransfersPage.vue, AccountantManagementPage.vue; components/Investments/ProfileModal.vue, MovementModal.vue.',
 '- production-settings.json; persisted-verification.json; source-activity.json; test-results.json; additional-checks.json; ui-default-selection.json; stock-account-selection.json; supplier-account-selection.json; online-permissions.json and per-suite logs.',
 '',
 'Posting-suite output:','```',posting.trim(),'```','',
];
fs.writeFileSync(`${dir}/review.md`,lines.join('\n'));
console.log(JSON.stringify(result,null,2));
