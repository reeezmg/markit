# Import historical ERP accounting

This upgrades historical bills and expenses to full ERP journal entries for companies
already connected to Accountant. It does not replay stock quantities, re-create source
documents or change their totals. Cancelled/deleted/non-bill documents and expenses
already represented by distributor payments are recorded as non-posting sources.

Run from Storetools (DATABASE_URL selects the database):

```powershell
node scripts/import-erp-history.mjs --all-connected --through=2026-09-29
node scripts/import-erp-history.mjs --all-connected --through=2026-09-29 --apply
```

Use repeated `--company=<id>` instead of `--all-connected` to select particular
enabled companies. `--report=<file>` preserves a named report. Preview performs the
complete import and verification inside a rolled-back transaction. Apply commits
all selected companies together only if every source and verification passes.

For a source awaiting factual clarification, a single explicitly selected company
can use `--defer-source=BILL:<id>` (or `EXPENSE:<id>`). The report names deferred
sources; they are not imported or considered resolved. Omit this option after the
source issue is resolved to finish its import.

## Existing cash/bank migration

The script identifies earlier LEGACY_CASH_BANK_HISTORY entries by exact BILL/EXPENSE
source ID and checks their import audit provenance. It posts an equal/opposite
ERP_HISTORY_MIGRATION_REVERSAL, cancelling both the cash/bank movement and migration
clearing counterpart. The full ERP posting supplies sales/expense/tax/receivable/COGS
counterparts. Original migration journals remain in the audit trail. Store settings
openings, distributor postings and unrelated transfers are preserved.

Repeats reuse the ERP source and migration reversal. Modified or independently
reversed migration journals block the batch. Invalid source documents and accounting
date locks also block; the script does not invent payment methods or amounts.

Historical bills whose recorded client no longer has a company membership retain
the actual source client ID/name as a journal snapshot with a dedicated audit entry.
This does not recreate client membership. Normal new-document validation remains.

## Reconciliation

Reports contain source-by-source outcomes, balances before/after, non-posting counts,
cash/bank differences from prior migrations, account/amount mismatch checks, journal
balance checks and a no-change second pass. Native posting uses existing ERP rules:
expense recovery uses the recorded recoverable amount; COGS uses the first accounting
cost snapshot or the available variant purchase price. Missing historical cost data
is not reconstructed. Physical stock valuation is a separate comparison.

After this upgrade, the old cash-only import preview can report native/import overlap
because it does not understand supersession. Do not force or reapply that old import
to this history. Use this ERP history script and its repeat verification instead.

Regression coverage: `npm run test:erp-accounting` includes migration replacement,
unchanged cash, repeat no-op and changed reversal rejection in an isolated schema.
