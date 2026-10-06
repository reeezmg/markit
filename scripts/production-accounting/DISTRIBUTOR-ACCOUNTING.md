# Distributor accounting import and repair

Run from `storetools`, with `DATABASE_URL` pointing to the intended database.
Use explicit company IDs from that database; development IDs may differ from production.

```sh
npm run db:accountant
npm run db:distributor-accounting
npx zenstack generate
npx tsx scripts/import-distributor-accounting.ts --company=COMPANY_ID
npx tsx scripts/import-distributor-accounting.ts --company=COMPANY_ID --apply
node scripts/verify-distributor-accounting.mjs
```

Repeat `--company=...` to process several companies. Preview is the default and
rolls back database changes, including default chart creation. It writes
`distributor-accounting-preview.json`. Apply writes `distributor-accounting-import.json`.

The script preserves configured accounts, fills missing mappings, imports missing
journals, and reverses/reposts changed sources. A purchase order with a linked payment
but no purchase credit supplies its missing purchase-side journal. Source rows and
stock quantities are not rewritten. Existing purchase credits take precedence over
conflicting purchase-order totals; the script does not guess that credits are duplicates.

Reports include before balances, missing journals, reconstructed purchases and source
conflicts. These migration details are not displayed as warnings on the distributor
screen. A missing journal is different from a missing source credit: the former is
repaired here; the latter remains absent in the legacy ledger.

Each supplier is an atomic transaction. Apply verifies expected versus posted payable,
balanced distributor journals and a second sync that must produce no changes. Failure
rolls back that supplier; earlier suppliers may already have committed. Re-running is
safe. Apply also enables automatic posting of subsequent source changes.

The verification command checks all enabled distributors in the target database.
This import covers distributor history only, not a complete opening trial balance,
sales/COGS migration, or bank reconciliation.

## Explicit purchase-order source authority repair

When the operator explicitly identifies purchase-order headers as authoritative,
`repair-purchase-order-accounting.mjs` can repair the purchase findings from a
saved raw-source audit. Normal distributor imports still preserve recorded credits;
this repair is an opt-in exception for the company/PO IDs in that audit and any
additional positive POs whose posted supplier disagrees with their source header
within those selected companies. Additional supplier-link repairs are listed in
the result report.
It accepts findings `POSITIVE_PO_WITHOUT_PURCHASE_EVENT`,
`POSITIVE_PO_WITHOUT_SUPPLIER`, `PURCHASE_HEADER_DIFFERS_FROM_SUPPLIER_CREDITS`
and `SUPPLIER_ONLY_ON_CREDIT_SOURCE` under each company's `issues`/`reviews` arrays.

```sh
# Preview executes the repair and verification in a transaction, then rolls back.
node scripts/production-accounting/repair-purchase-order-accounting.mjs --audit=PATH_TO_SOURCE_AUDIT.json --report=PATH_TO_PREVIEW.json

# Apply requires an exclusive backup destination that does not already exist.
node scripts/production-accounting/repair-purchase-order-accounting.mjs --audit=PATH_TO_SOURCE_AUDIT.json --report=PATH_TO_RESULT.json --backup=PATH_TO_BACKUP.json --apply
```

Keep application/background writes paused during the repair. It locks source tables
and company accounting scopes, backs up source/projection rows, affected journal
history, stock state and the previous view definition, and commits all selected
companies together only after verification. Source documents, old ledgers, payment
records and physical stock quantities remain unchanged. No cash/bank payment is
inferred from a purchase header's payment-method field.

Approval audit records with resource `purchase-order-header-authority` select the
POs. `lib/purchase-order-authority.mjs` preserves the installed distributor event
projection as `accountant_v2_distributor_events_before_po_authority`, including
existing exclusions, and installs the wrapper/functions/triggers from
`lib/purchase-order-authority.sql`. Approved purchase events use the PO's total,
calculated purchase GST, date and supplier. A single linked credit supplier supplies
the identity only when the header omits it. Multiple credit suppliers without a
header supplier remain unresolved and fail final reconciliation.

If neither header nor credits identify a supplier, the purchase uses the company's
existing Accounts Payable (2100), ERP Stock and Input GST mappings, with null
supplier/contact IDs. Immutable `PURCHASE_ORDER_SOURCE` journals and
`purchase-order-source-state` audit revisions retain the PO ID and amount/tax
evidence. This preserves missing attribution rather than creating a fictitious
vendor. The company's existing stock control offsets purchase postings as needed
to retain current source inventory value; these offsets use Inventory Adjustments.

Deferred purchase/credit triggers keep approved headers authoritative on edits,
supplier assignment and deletion. Corrections reverse/repost native journals;
old credits are never deleted. Date locks and company account validation still
apply. Future definitions of `accountant_v2_distributor_events` must preserve
this approved-PO wrapper as well as any authorized payment exclusion policy.
No new tables or schema-model fields are installed.

The repair checks every positive PO in the selected companies against current
purchase/tax postings, supplier payable balances, stock, journal balance and total,
unchanged cash/bank totals, unchanged source hashes and zero changes on repeated
supplier/unassigned/stock synchronization. The report contains before/after
balances and each PO's current journal IDs. Historical source audits remain
snapshots; use the new result report for post-repair status.

Run `node tests/purchase-order-authority.integration.test.mjs` for isolated,
transaction-rolled-back coverage of header authority, missing purchases/tax,
source edits/deletion/supplier assignment, unchanged credits, unapproved source
behavior, idempotency, locks, negative amounts and company account isolation.
