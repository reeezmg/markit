# Investor accounts and legacy investment import

Open **Investments** in the main sidebar. Its separate pages are Overview, Investors,
Capital & loans, Allocate profit, Profit payouts and Settings. Ownership and
agreement history are managed within Investors. The old
`/accountant/investors` route redirects to `/investments/investors`. New investor
profiles link their user to a selected existing equity account; profile creation
does not create chart accounts. Optional existing profit payable and loan liability
accounts support those movements. Legacy imported profiles retain their dedicated
capital, profit payable and loan accounts.
Settings → Account → Investments holds account and payment defaults, including
profit-distribution equity. New receipts/payments post directly to the selected cash/bank account. Ownership
and profit-sharing agreements are separate, dated records. Allocate profit computes
company profit from posted income minus expenses in the new books for the chosen
period, including exchange rates and excluding drafts/deleted lines. Complete the
books first; missing source entries and period closing entries affect that result.
Enter the total company amount to share, preview all active investors, then approve
once as manager/admin. The whole batch posts or rolls back together, and changed
previews/overlapping allocations are rejected. The period's saved profit-share
percentage determines each allocation. Split a period if an agreement changes;
missing agreements must be added first. Unassigned shares and rounding stay in
the business. Allocations debit the automatically created Investor profit
distributions equity account (change once in Settings if needed) and credit profit payable;
payouts clear that liability. CSV statements include opening/closing balances.
Documents are HTTP/HTTPS links, not uploaded copies.

## Install

Run from Storetools with the deployed dependencies and `DATABASE_URL` configured:

```powershell
npm run db:investors
npm run db:investors -- --apply
```

The first command tests the migration inside a rolled-back transaction. The second
installs and records `20260930120000_investors` in `_prisma_migrations`, checking its
checksum on repeats. Existing Accountant tables and the legacy `investments` table
must be installed first. Normal deployment should generate Prisma/ZenStack from
`schema.zmodel`. This standalone installer/import is separate from the general
production-accounting runner; its automatic stages do not migrate investments.

The user-linking flow requires migration `20260930180000_investor_user_role`.
`node scripts/production-accounting/apply-investor-user-role.mjs` previews it;
add `--apply` to install the additive role and record its checksum. New users created
through Investments get the investor role; selected existing users keep their role.

## Import old investments

The importer accepts `--time-zone=Asia/Kolkata` to preserve India-local legacy
calendar dates. The unified entrypoint defaults to Asia/Kolkata. The original timestamp is kept in
the source snapshot; repeat imports reject timezone changes.

The old writer only posts an `INVESTMENT` ledger row, even when its payment mode
is CASH/BANK. It does **not** prove whether the cash/bank movement is already in
the new books. Supply reviewed mappings per completed legacy investment ID.
No automatic CASH/BANK guess or ownership percentage is made.

`investor-mappings.local.json` contains an object keyed by old investment ID:

First run `npm run db:import-investors -- --company=COMPANY_ID --through=2026-09-30 --plan`.
This reads the legacy rows and available new accounts without creating profiles or
journals. Copy its `companies[0].investments.mappings` template into the mappings file, then fill each
account ID after checking whether that movement is already in the books.

```json
{
  "old-investment-id": { "counterAccountId": "reviewed-account-id" },
  "already-posted-source-id": {
    "counterAccountId": "original-equity-account-id",
    "existingJournalId": "verified-existing-journal-id"
  }
}
```

Use cash/bank only if the money movement is missing from the new books. Use a
reviewed equity/liability/asset counterpart for a historical reclassification or
opening adjustment. When a journal already has this legacy source ID, its ID is
required: the importer verifies company, published status, no reversal, date and
the exact signed capital line on the mapped equity account, then reclassifies
that line into the investor's new capital account **without moving cash again**.
Existing postings that lack the legacy source ID require reconciliation before
import; the script cannot infer that an unrelated journal represents the same money.

```powershell
# Preview: full import and repeat check, then rollback. No financial data persists.
npm run db:import-investors -- --company=COMPANY_ID --through=2026-09-30 --mappings=investor-mappings.local.json
# Commit the reviewed mapping and cutoff atomically for this company.
npm run db:import-investors -- --company=COMPANY_ID --through=2026-09-30 --mappings=investor-mappings.local.json --apply
```

Exactly one company is accepted per invocation. `--report=path.json` overrides the
default `investor-history-report.json`. Stop legacy investment writes during
cutover. The importer also takes a table lock while copying the source snapshot.
The standalone import allows up to ten minutes for its atomic transaction; normal
Accountant API requests retain their existing thirty-second timeout.
It preserves source IDs, original timestamps/notes/payment modes in event metadata,
creates profiles by legacy company/user, and imports every row through the cutoff.
Completed rows post at the original date and respect accounting/banking locks.
Pending rows remain visible and unposted; the importer does not mark them paid.
Their eventual real movement should be recorded as a new investor entry with the
old ID in its reference. Profiles and agreements can then be completed in the UI.

Original rows remain in place. A database trigger rejects edits/deletes of imported
rows, including generated CRUD; use a reasoned reversal in the investor page for
posted corrections. Repeat imports verify fingerprints and supplied mappings and
skip identical sources. Missing/changed imported sources abort the transaction.
Migration snapshots persist even after a later reversal, so re-running the script
does not repost reversed capital. A failed import rolls back its profiles, accounts,
journals, events and audits together.

```powershell
npm run test:investors
```

The test creates and removes a dedicated random PostgreSQL schema. It covers tenant
isolation, dated terms, allocations, payout limits, reversals, date locks, preview,
repeat imports, immutable source rows and balanced journals.
