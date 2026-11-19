# Investor accounts and legacy investment import

Open **Investments** in the main sidebar. Its separate pages are Overview, Investors,
Capital, Allocate profit, Profit payouts and Settings. Loans is a separate finance
sidebar item beside Investments, at `/loans`. Old `/investments/loans` links
redirect and preserve the selected company/investor/repayment query. Capital tracks
contributions and returns. Loans manages individual borrowing agreements, fixed-rate
or imported schedules, due interest accounting, partial principal/interest payments,
fees, reasoned payment reversals and early settlement. Its schedule CSV preserves
the contractual principal/interest breakdown. Only actual principal projects into
the combined investor statement; interest is recognized by scheduled journals.
The Loans index contains only the loan table; opening a row navigates to its
dedicated detail page with its schedule and payments. Save loan immediately records
the receipt and opens the loan, without validation or confirmation. Earlier
unposted drafts can be completed by saving their information once. Earlier
unassigned movements remain on the separate Earlier loan history page and are not
adopted automatically. Saving records a new receipt; do not re-enter historical funding.
Loans has sidebar pages for Loan accounts, Repayments, Settings and Earlier history.
Repayments lists due/upcoming unpaid instalments and opens their loan for payment.
Loan settings manages the five shared default accounts. Each loan saves its own
account selections; investor profiles expose only equity and profit-payable
accounts and require no loan-account setup. Historical mappings stay preserved.
Add investor opens a full-screen form. The Investors directory contains one table;
clicking a row opens details, holdings, ownership history and the account statement.
No ownership agreement is required or editable. Historical records stay readable.

With Include shares enabled, save the profile then use Buy shares or Redeem shares:
- Buy: enter cash amount and the transaction's price per share; units = amount / price.
- Redeem: enter units and the redemption price; cash = units x price rounded to cents.
- Each transaction can have a different price. Remaining units determine ownership
  and profit share against the fixed company total. Transactions never use an old
  agreement price or pay a capital commitment before awarding shares.

With Include shares disabled, enter ownership % and profit-share % directly in
Add/Edit investor. The effective date preserves history. Capital received/returned
in this mode does not change those percentages. Existing shares must be redeemed
before replacing that investor's participation with percentages; mode changes do
not erase holdings. Managers/admins manage participation and record share trades.

The form asks Payment status: Paid in full, Not paid - keep as due, or Partially
paid with the amount actually paid. Shares move immediately; only confirmed cash
is posted to Capital and the chosen bank/cash account. Unpaid purchases show
Capital due from investor; unpaid redemptions show Redemption due to investor.
These are separate operational dues, not automatically posted GL receivables.

Use Receive payment / Pay redemption due on the profile, or Capital > Record
capital movement > Settle share due. Select the original trade and record the
actual payment (partial or full). This reduces its due without changing shares or
re-entering its price. Capital > New share movement instead records a new purchase
or redemption at a chosen price with payment confirmation. The profile and Capital
share the same underlying records; no second manual cash entry is needed.

Trade, ownership and any immediate payment save atomically. Failed/stale previews,
overpayments, wrong-party/direction settlements and protected history are rejected.
Payment reversals reopen the due while keeping units. Cancel a share trade only
after its payments are reversed and dependent later changes are resolved. Existing
paid history is preserved and never reclassified as unpaid. Old agreement capital
commitments remain removed; new trade-specific dues replace no historical records.

The old
`/accountant/investors` route redirects to `/investments/investors`. New investor
profiles use the company's default equity, profit-payable and loan-liability
accounts, with optional investor overrides. Forms reuse the accounts created with
the company; missing standard accounts and selections are initialized automatically
and audited without posting money. Loan entry also preselects receiving Cash/Bank,
current liability, interest expense and fees expense. Configure shared defaults in
Settings > Account > Investments / Loans. Legacy imported profiles retain their dedicated
capital, profit payable and loan accounts.
Settings → Account → Investments holds account and payment defaults, including
profit-distribution equity. New receipts/payments post directly to the selected cash/bank account. Ownership/profit percentages are retained as internal dated snapshots. Allocate profit computes
company profit from posted income minus expenses in the new books for the chosen
period, including exchange rates and excluding drafts/deleted lines. Complete the
books first; missing source entries and period closing entries affect that result.
Enter the total company amount to share, preview all active investors, then approve
once as manager/admin. The whole batch posts or rolls back together, and changed
previews/overlapping allocations are rejected. The period's saved profit-share
percentage determines each allocation. Split a period if ownership changes; profiles need percentages or share purchases before allocating profit. Unassigned shares and rounding stay in
the business. Allocations debit the automatically created Investor profit
distributions equity account (change once in Settings if needed) and credit profit payable;
payouts clear that liability. CSV statements include opening/closing balances.
Documents are HTTP/HTTPS links, not uploaded copies.

## Verify the investor flow without live writes

`npm run test:investor-flow` checks the UI types and runs the real investor and
allocation handlers against an in-memory transaction adapter. It covers combined
creation/rollback/retries, tenant and role checks, capital receipts/returns,
posted-profit allocation, partial/full payout, variable-price share trades,
paid/unpaid/partial confirmations, linked settlements, payment/trade reversals,
rounding, settings modes and protected ownership history. It does
not execute the older schema-creating `test:investors` integration script.

`npm run test:investor-flow:browser` uses the real Nuxt UI components and the same
handler fixture over a local HTTP server. It checks the full-screen form and fixed
save footer, single-table directory, row navigation, profile error/retry, details,
holdings and statement, purchases/redemptions at different prices, direct profile
percentages, confirmations and due settlements from both profile and Capital. Set `PRINT_TEST_WINDOW_SIZE=390,844` to repeat at mobile size.
Neither test command creates live users, database schemas or financial records.

## Install

The agreement-based Loans feature additionally needs the locally prepared
`20261102120000_loan_management` migration. Preview it offline from Storetools:

```powershell
node scripts/production-accounting/apply-loan-management.mjs
```

This command does not load credentials, connect to a database or execute DDL.
After a **separate explicit database instruction**, the same command with `--apply`
installs only its two tables, records the migration checksum and imports no history.
Do not apply older pending migrations as part of this installation. The Loans page
shows installation pending until the tables exist. Existing Accountants/investors
are prerequisites. `GET /api/cron/loans` uses the existing `CRON_SECRET` and is
scheduled at 01:30 UTC in Vercel; other hosting must configure an equivalent job.
Scheduled entries also catch up on save, payment or explicit Post due entries.

The older investor installation below is historical setup guidance, not current
authorization to run database schema commands:

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
old ID in its reference. Profile details and percentage participation can then be completed in the UI; share holdings are managed through purchases/redemptions.

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
