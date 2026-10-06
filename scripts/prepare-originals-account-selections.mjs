import fs from 'node:fs';
const dir = 'scripts/production-accounting/runs/originals-settings-selection-2026-10-06';
const snapshot = JSON.parse(fs.readFileSync(`${dir}/account-usage.json`, 'utf8'));
const accounts = snapshot.accounts.filter(a => a.is_active && !a.deleted_at);
const byId = id => accounts.find(a => a.id === id);
const byCode = code => accounts.find(a => a.code === code);
const bank = accounts.find(a => a.type === 'BANK' && a.is_primary && a.posted_rows > 0);
const cash = byCode('1001');
const plan = { company: snapshot.company, status: 'reviewed-not-saved', databaseWrites: false, groups: {}, unresolved: [] };
function add(group, field, account, reason) {
  plan.groups[group] ||= {};
  plan.groups[group][field] = account ? { id: account.id, name: account.name, type: account.type, postedRows: account.posted_rows, reason } : { id: null, reason };
  if (!account) plan.unresolved.push({ group, field, reason });
}
for (const [field,id] of Object.entries(snapshot.settings.erp.accounts)) {
  add(['expense','inputTax','expensePayable'].includes(field) ? 'Expenses' : 'Billing & sales', field, byId(id), 'Preserve the existing saved ERP selection.');
}
for (const field of ['cash','bank']) add('Expenses', field, byId(snapshot.settings.erp.accounts[field]), 'Shared with billing.');
for (const [field,id] of Object.entries(snapshot.settings.staff.accounts)) add('Salary & staff credit', field, byId(id), 'Preserve existing staff and historical bank mappings; do not substitute GST or supplier accounts for salary obligations.');
for (const role of ['payable','stock','tax','cash','bank','opening']) {
  const choices = snapshot.suppliers.filter(m => m.role === role);
  add('Purchase & supplier payments', role, choices.length === 1 ? byId(choices[0].account_id) : null, 'Reuse the existing selection shared by all 11 suppliers.');
}
add('Investments', 'counterAccountId', cash, 'Existing capital receipts use cash more often than bank.');
add('Investments', 'payoutAccountId', cash, 'Existing cash account; each payout can choose bank instead.');
for (const field of ['capitalAccountId','profitAccountId','loanAccountId']) add('Investments', field, null, 'Keep investor-specific linked accounts; do not turn one investor’s accounts into company-wide defaults for new investors.');
add('Profit distribution', 'accountId', byCode('INV-DISTRIBUTION'), 'The dedicated existing equity account is valid for distributions; individual investor capital and migration clearing are not suitable. This account currently has no posted rows.');
for (const group of ['Receive money','Pay money']) {
  add(group, 'moneyAccountId', cash, 'Use the existing cash account; bank remains available per transaction.');
  add(group, 'purposeAccountId', null, 'The source purpose must decide this; earlier instructions require unexplained Receive/Pay purposes to remain blank.');
}
add('Transfers', 'fromAccountId', cash, 'Existing transfer endpoint with posted activity.');
add('Transfers', 'toAccountId', bank, 'Existing primary bank endpoint; distinct from Cash.');
for (const field of ['assetAccountId','accumulatedDepAccountId']) add('Fixed assets', field, null, 'No active FIXED_ASSET account exists; cannot substitute Stock or another account type.');
add('Fixed assets', 'depreciationExpenseAccountId', null, 'No existing dedicated depreciation expense account or activity; General Expenses includes unrelated expenses.');
add('Fixed assets', 'proceedsAccountId', bank, 'Existing Primary Bank, selectable per disposal.');
add('Fixed assets', 'gainLossAccountId', null, 'No asset-disposal gain/loss account or activity supports a selection.');
for (const [field,id] of Object.entries(snapshot.settings.erp.accounts).filter(([field]) => field !== 'expense')) add('Online sales & settlements', field, byId(id), 'Reuse existing ERP selections; do not enable online posting as part of choosing defaults.');
for (const [field,code] of Object.entries({ codClearing:'EC-COD', gatewayClearing:'EC-GATEWAY', deliveryIncome:'EC-DELIVERY', codIncome:'EC-COD-INCOME', refundPayable:'EC-REFUNDS', shippingExpense:'EC-SHIPPING', gatewayExpense:'EC-GATEWAY-FEE', loyaltyExpense:'EC-LOYALTY' }))
  add('Online sales & settlements', field, byCode(code), 'Reuse the existing dedicated online account. No posted online rows exist; selecting a busier unrelated account would change its meaning.');
fs.writeFileSync(`${dir}/recommended-selections.json`, JSON.stringify(plan, null, 2));
let markdown = '# Originals Clothing — reviewed account selections\n\nRead-only review. These selections have not been saved. Published journal-row counts include historical imports and reversals; they are usage evidence, not balances.\n\n';
for (const [group, fields] of Object.entries(plan.groups)) {
  markdown += `## ${group}\n\n| Setting | Account | Posted rows | Reason |\n|---|---|---:|---|\n`;
  for (const [field, selection] of Object.entries(fields)) markdown += `| ${field} | ${selection.name || 'Leave blank / unresolved'} | ${selection.postedRows ?? '—'} | ${selection.reason} |\n`;
  markdown += '\n';
}
fs.writeFileSync(`${dir}/recommended-selections.md`, markdown);
console.log(JSON.stringify({ company: plan.company.name, reviewedGroups: Object.keys(plan.groups).length, fields: Object.values(plan.groups).reduce((n,g) => n + Object.keys(g).length, 0), unresolved: plan.unresolved.length, status: plan.status }));
