import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve(process.env.ACCOUNTING_REVIEW_DIR || 'scripts/production-accounting/runs/sidebar-fixes-2026-10-06');
const summary=JSON.parse(fs.readFileSync(path.join(dir,'review-summary.json'),'utf8'));
const activity=fs.existsSync(path.join(dir,'production-activity.json')) ? JSON.parse(fs.readFileSync(path.join(dir,'production-activity.json'),'utf8')) : null;
const dataVerified=summary.persistedVerification.unchanged || !!activity?.reconciled;
const fixed=[
 [1,'Billing retry uses a persisted request UUID and committed receipt.','erp-accounting-api.integration.test.ts.log; billing-ui-probes.json'],
 [2,'Sales inline status and paid modal retain the bill owner.','billing-ui-probes.json'],
 [3,'B2B deletion awaits the complete scoped bill service.','billing-ui-probes.json; erp-accounting-api.integration.test.ts.log'],
 [5,'Offline retries return a saved receipt without a second quantity or valuation change.','sidebar-route-probes.json'],
 [7,'Statement expenses and supplier payments post to the selected native BANK account.','statement-route-probes.json'],
 [8,'Zero debit with positive credit uses the credit amount.','statement-route-probes.json'],
 [9,'Failed statement rows remain retryable; the batch completes only after every row.','statement-route-probes.json'],
 [10,'Statement source/replacement, completion receipt and postings commit together; concurrent retries replay.','statement-route-probes.json'],
 [11,'ERP Stock settings and default stock valuation change in one transaction. PO snapshots stay frozen.','stock-account-selection.json'],
 [12,'First supplier opening uses the company purchase opening default; recorded openings stay frozen.','supplier-account-selection.json'],
 [13,'Profit setting controls and save handler match the admin/manager endpoint permission.','online-permissions.json'],
];
const table=fixed.map(([id,change,evidence])=>`| ${id} | ${change} | ${evidence.split('; ').map(file=>`[${file}](${file})`).join('; ')} |`).join('\n');
const report=`# Selected sidebar accounting fixes — 2026-10-06

Implemented the 11 requested fixes: **1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13**.
These are local code changes, with native posting tested in disposable schemas or
outer rollback transactions. No application deployment or production migration was performed.

| Gap | Resulting behavior | Evidence |
|---|---|---|
${table}

Validation: **${summary.suites.completed} completed, ${summary.suites.unavailable} unavailable, ${summary.suites.failed} unexpected suite failures**.
${summary.persistedVerification.testedTables} production source/financial tables: **${summary.persistedVerification.unchanged?'unchanged':activity?.reconciled?'all differences explained by a new production bill':'verification requires review'}**.
Leftover schemas: ${summary.persistedVerification.leftoverSchemas.length}.
See [suite matrix](test-matrix.md), [full evidence report](sidebar-recheck.md) and [data verification](persisted-verification.json).

${activity?.reconciled ? `Production activity: ${activity.bills.map(b=>`${b.company} #${b.invoice_number}, ₹${b.grand_total} ${b.payment_method}`).join('; ')} was added during testing. Raw hashes therefore changed. Read-only virtual exclusion of its bill/dependent rows and invoice-counter increment, plus the future-dated legacy row's previous running balance/update timestamp, reproduces every changed table's original count and hash. All other tables match directly; no test residue or leftover schema remains. The bill was preserved. See [activity reconciliation](production-activity.json).` : ''}

## Deployment requirement

Gap 12 includes the additive migration \`20261006120000_supplier_opening_account_default\`.
It covers generated supplier-opening writes and does not replace the installed
supplier posting function or its historical purchase-authority corrections.
The migration and application changes need deployment before they affect production behavior.
No history/backfill or source correction was performed by this task.

## Intentionally remaining

- **4:** Client direct bill deletion still bypasses complete stock/loyalty/staff lifecycle cleanup.
- **6:** Statement ISO date parsing can select the wrong accounting period.

The existing Accountant focused typecheck still reports four pre-existing errors;
the Reports focused typecheck ${summary.checks.reportTypecheck}. The live order-cancellation
test is unavailable when no eligible source order exists; isolated ecommerce tests
cover cancellation/refund/restocking. UI tests compile Vue and execute actual
handlers with mocks; no authenticated browser or deployed-build check was performed.
`;
fs.writeFileSync(path.join(dir,'selected-fixes.md'),report);
summary.productionActivity=activity ? {reconciled:activity.reconciled,bills:activity.bills,evidence:'production-activity.json'} : null;
fs.writeFileSync(path.join(dir,'review-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({implemented:fixed.map(row=>row[0]),remaining:[4,6],suites:summary.suites,productionUnchanged:summary.persistedVerification.unchanged,productionDifferencesExplained:!!activity?.reconciled,report:path.join(dir,'selected-fixes.md')},null,2));
if(summary.suites.failed || !dataVerified || summary.findingsConfirmed!==2)process.exitCode=1;
