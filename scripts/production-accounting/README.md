# Production accounting adoption

This folder owns the production import implementations and their SQL/planning helpers.
Run it **inside the deployed Storetools repository**, with its installed dependencies,
current application schema and generated Prisma client. It is not a standalone folder:
the TypeScript importers use `server/utils/accountant`, and the ordered migration files
remain in the canonical `prisma/migrations` directory. Old `scripts/*.mjs`/`.ts` commands
are compatibility entry points to these same implementations.

## Run

Ecommerce accounting is a separate prospective connection: after the existing ERP
schema is installed, run `node scripts/apply-ecommerce-accounting.mjs --apply` from
Storetools and activate each company under Accountant > Ecommerce accounting.
The main adoption runner does not enable ecommerce or import old ecommerce orders.
See `docs/ARCH-pages-accounts.md` for the posting coverage and historical boundaries.

1. Deploy this version, install dependencies and generate the Prisma client normally.
   Take a database backup and pause application/background writes for the cutover.
2. Copy `production.example.json` to `production.local.json` in this folder. Set the
   **production** company IDs, the cutoff date and a dedicated output directory.
   Include every company you want to import. No development IDs or approvals are supplied.
3. Set `DATABASE_URL` to production using the environment or Storetools `.env`.
   An existing environment variable takes precedence. Credentials are never written to reports.
4. From `storetools`, run:

```powershell
# Read-only company/schema preflight and stage plan. This does not simulate the import.
node scripts/production-accounting/run.mjs --config=scripts/production-accounting/production.local.json

# Execute the stages, or resume a previous run after fixing its reported issue.
node scripts/production-accounting/run.mjs --config=scripts/production-accounting/production.local.json --apply

# Repeat final read-only checks against the saved cutover reports.
node scripts/production-accounting/run.mjs --config=scripts/production-accounting/production.local.json --verify
```

`npm run db:production-accounting -- --config=...` is equivalent. Output paths and
`cashReview` paths are relative to the config file. The company set, cutoff and target
database are bound to that run directory. Preserve the whole directory with your
deployment records; reports contain financial data and are ignored by Git.

## Stages in order

| Stage | What it does |
|---|---|
| schema | Applies the accounting migrations in `plan.mjs`, checking existing migration checksums |
| setup | Creates/reuses standard chart accounts, Primary Bank details and ERP mappings; enables future ERP posting |
| distributors | Imports purchases, returns, supplier credits/payments and opening dues; keeps recorded purchase credits and supplies missing purchase entries from available documents |
| cash-bank | Imports Cash/Primary Bank openings from Store settings and old ledger history, including transfers and money transactions; reuses existing native source postings |
| erp-history | Imports bills and expenses with native income, tax, receivable, expense and COGS lines; reverses overlapping cash migration entries before native replacement |
| transactions | Adds old paid standalone money transactions to Receive/Pay; reuses existing cash-history journals and verifies repeat runs |
| transfers | Creates new transfer records from old transfers and replaces cash-history postings with complete source/destination entries |
| staff-setup | Enables salary and staff-credit accounting for new activity only; old staff rows remain excluded |
| stock | Reconciles remaining item quantities × current purchase price, retaining PO links and including stock without a PO; enables automatic stock control |
| verify | Checks history coverage, unchanged source synchronization, native journal lines, supplier dues, stock, balanced journals and cash/bank totals |

Historical cash movements without a native posting use **Legacy cash/bank migration
clearing** as counterpart. This does not reconstruct a separate historical payroll,
investment or named-bank subledger. Only Cash and Primary Bank old ledgers are imported.
Stock differences use **Opening Inventory** initially, then **Inventory Adjustments**.
Stock is current-cost valuation at cutover, not reconstructed historical FIFO.
Distributor and stock stages use current source state; ERP and cash history use the
inclusive cutoff date. Normally choose the cutover date while writes are paused.

Source documents and stock quantities are not recreated or deleted. Existing configured
accounts are retained. When source accounting differs from inconsistent old ledger totals,
the scripts retain and report that difference; they do not fabricate purchases/payments.
Balanced journals alone are insufficient: the final source and account checks must pass.

## Preview a stage / resolve a blocked source

Once schema/setup prerequisites exist, each data stage can be previewed independently:

```powershell
node scripts/production-accounting/run.mjs --config=scripts/production-accounting/production.local.json --preview=cash-bank
```

Other preview stages: `setup`, `distributors`, `erp-history`, `transfers`, `staff-setup`, `stock`. Data previews roll
back their writes; cash preview only reads. Setup preview shows account mappings without
enabling posting. Distributor preview describes missing mappings/journals; apply performs
its full posting checks. These are stage previews, not a simulation of all prior stages.

If cash history has conflicting legacy rows, inspect `cash-bank-preview.json`. To accept
specific reviewed differences, set `"cashReview": "./runs/production-cutover/cash-bank-preview.json"`
in the config, then rerun `--apply`. The importer accepts only identical reviewed conflicts
and balances. Review **that production report**, not a development report. New conflicts,
changed balances, missing opening metadata and date locks can still block the import.

Invalid bills/expenses stop the run with a source-specific report. For example, a paid
split bill with no payment split cannot be assigned a cash/bank method by guessing.
Correct its source data and resume. The full runner deliberately has no silent source
exclusion option. Individual ERP tooling documents explicit deferrals for investigations,
but final verification still reports incomplete history.

## Resume and transaction boundaries

The runner stops at the first failure. Earlier successful stages remain committed;
this is **not one transaction for the whole cutover**. Distributor import commits per
supplier, setup per company, while cash/ERP/stock imports each commit their selected
companies atomically. Their repeat checks make an interrupted stage retryable.

`state.json` records completed stages and hashes their report files. Rerunning the same
command skips completed stages and reruns final verification. Never delete that state
to restart cash import after ERP history: ERP has superseded those cash entries. The
runner rejects cash replay when supersession journals exist. A database adopted using
older individual scripts must be verified with its original reports, not passed through
this fresh-adoption runner as a new import.

The same output directory cannot be used by two runner processes. If the process was
forcibly killed, check that it has stopped before removing its stale `runner.lock`.
Use one cutover runner and keep application writes paused until verification passes.
If restoring a database backup, restore the matching run records too.

Final cash checks use the cash import baseline plus native ERP before/after changes.
They verify the cutover snapshot; after resuming business, new backdated activity can
legitimately require a fresh investigation. Stock verification always checks current
source value. Keep the final report as evidence of the completed cutover.

## Included tools

- `run.mjs`, `plan.mjs`: ordered runner, config validation and migration manifest.
- `apply-*.mjs`: accounting schema installers.
- `connect-erp-accounting.ts`: chart/default ERP setup.
- `connect-user-accounting.ts`: new-only salary/staff-credit setup.
- `verify-user-accounting.mjs`: read-only staff posting verification.
- `import-distributor-accounting.ts`: supplier source history.
- `import-legacy-cash-bank.mjs`, `lib/legacy-cash-bank-*.mjs`: old cash/bank planner/import.
- `copy-old-account-history.ts --only=transactions`, `lib/import-transactions.mjs`: old standalone transactions into Receive/Pay.
- `transaction-mappings.example.json`: optional company, bank and purpose-account mapping template.
- `import-erp-history.mjs`, `lib/import-erp-history.sql`: native historical ERP replacement.
- `reconcile-stock-accounting.mjs`: product stock reconciliation and activation.
- `verify.mjs`: production checks without development snapshot dependencies.
- Domain guides in this folder explain detailed posting and reviewed-conflict policies.

Validation: `npm run test:production-accounting`, `npm run test:cash-bank-import`,
`npm run test:erp-accounting`, and `npm run test:stock-accounting`.

## Validation recorded for this packaging change

Runner plan tests, cash-history PostgreSQL tests and ERP PostgreSQL regression tests
passed. Runner preflight and setup/distributor/stock previews were exercised against
the configured database without committed accounting changes. Final verification
passed for Ubar Mobiles, reezc and ORIGINALS CLOTHING using their actual import reports.
It rejected Markit's known unresolved split-payment bill as incomplete history.
No fresh production import was executed while packaging these tools.

Salary/staff credit rollout alone (new activity only):
```powershell
npm run db:user-accounting
npm run db:connect-user-accounting -- --company=COMPANY_ID --apply
node scripts/production-accounting/verify-user-accounting.mjs --company=COMPANY_ID
```
The Users Salary/Credit/Ledger Accounting panel exposes account choices. Old payroll
sources remain excluded; new deductions added to a pre-existing cumulative credit cut
post only the amount above its activation baseline. No payroll history import occurs.

## Standalone transaction history

The `transactions` stage follows ERP history and precedes staff setup. See
[TRANSACTIONS.md](TRANSACTIONS.md) for standalone preview/apply commands, explicit
purpose and named-bank mappings, journal reuse and verification. It preserves old
source rows and exposes verified history in Receive / Pay money. No salary history
is imported by this stage. Preview with `--preview=transactions` on the runner.


### Run only the old Transactions import

From `storetools`, with the target database configured and accounting setup complete:

```powershell
# Preview; all changes are rolled back. Replace both placeholders.
npm run db:import-transactions -- --company=COMPANY_ID --through=YYYY-MM-DD --report=transaction-preview.json

# Apply the same import.
npm run db:import-transactions -- --company=COMPANY_ID --through=YYYY-MM-DD --apply --report=transaction-import.json
```

Repeat `--company=...` to include more stores. Existing imported Cash/Primary Bank
journal rows are linked to Receive/Pay instead of posted again. For transactions
without an existing journal, copy `transaction-mappings.example.json`, replace its
placeholder IDs and pass `--mappings=PATH_TO_YOUR_MAPPING_FILE`. See
[TRANSACTIONS.md](TRANSACTIONS.md) for the explicit migration-clearing alternative.
The old rows remain in the database. Pending and source-owned salary/distributor
transactions are not posted a second time.

Test the importer with `npm run test:transaction-history`; its fixtures roll back.


## Account transfer history

Use [TRANSFERS.md](TRANSFERS.md) and `copy-old-account-history.ts --only=transfers` for old Account Transfers.
This is separate from Receive/Pay transactions. Preview/apply/read-only verification
are supported, and the main runner executes this stage after `transactions`.
