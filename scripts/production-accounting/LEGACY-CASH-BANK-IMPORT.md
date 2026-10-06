# Import old Cash and Primary Bank history

Run from `storetools`. The script uses `DATABASE_URL` (an existing environment variable
wins over `.env`). It requires the installed Accountant, ERP and distributor integration
schema. It does not change schema, enable integrations or import other bank accounts.

## Preview

```powershell
npm run db:import-cash-bank -- --all-connected --through=2026-09-29
```

Or select a company with `--company=<company-id>`; repeat that argument for several.
`--all-connected` selects companies with enabled ERP or distributor accounting. It
never means every company in the database. Default cutoff, if omitted, is the current
UTC timestamp. An explicit `--through` includes the whole stated calendar day using
the stored ledger timestamps. Use the same cutoff for preview, apply and repeat checks.

The JSON report defaults to `legacy-cash-bank-preview.json` and includes account IDs,
old totals, current new totals, each missing journal, existing source matches and conflicts.
Preview never creates an account or journal. Use `--report=<path>` to retain each report.

## Store settings opening balances

The opening amounts and dates come from `/settings/store`: `companies.cash`,
`companies.bank`, `opening_cash_date` and `opening_bank_date`. They must agree with
the old ledger's opening rows; a missing or conflicting old opening blocks apply.
The script creates normal `OPENING_BALANCE` journals and new-account opening-balance
records, using **Opening Balance Adjustments** (code 2220) for the other side.
An existing matching opening is reused. It is never added again as ordinary history.
For example, the saved Cash 18,032 and Bank 73,243.60 remain the starting amounts,
with their saved dates; transaction-history movements are imported separately.

This is a script import; saving Store settings does not automatically update the
new books. Later differences are detected on a repeat preview and require review.

## Apply one company

Choose an active equity or liability account in the new chart for historical migration
counterparts, for example a dedicated **Legacy cash/bank migration clearing** account.
Then use its ID explicitly:

```powershell
npm run db:import-cash-bank -- --company=<company-id> --through=2026-09-29 --offset-account=<account-id> --report=review.json
npm run db:import-cash-bank -- --company=<company-id> --through=2026-09-29 --offset-account=<account-id> --apply
```

Optional `--cash-account=<id>` and `--bank-account=<id>` override the default Cash code
1001 and primary Bank account. Explicit account IDs require one company per command;
IDs cannot be shared across companies. The script never chooses another company's account.

The explicit offset is for missing historical movements other than the Store settings
openings (which use code 2220). It is not a plug for a
balance discrepancy. Cash-to-primary-bank transfer legs balance each other without
an offset. Existing matching ERP/distributor entries retain their real counterpart accounts.
Imported offset entries do **not** reconstruct historical sales, expense, tax, payroll,
client or supplier subledgers. Do not treat this import as a complete financial-history migration.

The full import runs in a transaction, checks accounting/banking locks, and re-plans
after insertion to verify an exact balance match and zero further imports. It briefly
locks the old ledger against writes during apply. Any conflict or failure rolls back
all companies selected by that command. Run during a quiet period.

## Re-running and historical corrections

Re-running with unchanged history makes no additional entries. Matching relies on
source IDs, account IDs, dates and amounts; never on fuzzy amount matching alone.
Old money-in credits become new asset debits; old money-out debits become asset credits.
Dates and source references remain in the new entries. Audit records retain fingerprints.

This is an immutable historical snapshot, not ongoing synchronization of old ledgers.
If a source has changed, disappeared, subsequently been imported by another integration,
or already has a conflicting new posting, the script stops and reports it. Do not force
ERP history imports over the same migrated sources. New-only postings that prevent a
matching balance also block application; the script does not delete or overwrite them.

A source shown twice in the old ledger (such as an expense and its linked distributor
payment) cannot both reuse one accounting posting. Review such duplicates before apply.
Likewise, a return recorded as a bank movement in the old ledger must be reviewed if its
new posting affects only inventory/payables. No balancing adjustment is fabricated.

## Reviewed differences: preserve the new books

When the new postings have been reviewed and accepted as authoritative, use an
explicit reviewed snapshot rather than forcing old balances onto them:

```powershell
npm run db:import-cash-bank -- --all-connected --through=2026-09-29 --migration-clearing --review=legacy-cash-bank-approved-review.json --apply --report=legacy-cash-bank-applied.json
```

`--migration-clearing` creates/reuses a separate company-owned equity account named
Legacy cash/bank migration clearing, inside the same transaction. Preview writes
nothing. Store settings openings still use code 2220.

The review JSON contains version 1, the exact `through` timestamp, and `companies`
with `companyId`, `conflicts`, and `reconciliation` copied from the reviewed preview.
Only identical conflicts are accepted; old and projected new balances must still
match the reviewed amounts and account IDs. New conflicts, changed imported sources,
period locks and opening metadata checks continue to block application. Existing
native postings remain untouched. Reports retain accepted conflicts and the review;
import audit records include its hash. Reuse the same review and cutoff for a repeat
check. This particular review is specific to this database snapshot, not a blanket
approval for a different production database.

## Tests

```powershell
npm run test:cash-bank-import
```

The integration test creates and removes only a randomly named test schema. It covers
read-only preview, source reuse, balanced insertion, exact totals, repeat execution and
rollback on changed source data. It does not write to company books.
