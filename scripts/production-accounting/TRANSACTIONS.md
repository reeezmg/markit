# Old transactions into Receive / Pay money

Run from the Storetools repository with its production DATABASE_URL configured.
Install the Accountant/ERP/staff schema stages first. The standard production runner
now includes `transactions` after `erp-history`, before staff setup. It reuses the
cash/bank stage's journals and does not choose new purpose accounts automatically.

Preview (all changes roll back):

```powershell
npm run db:import-transactions -- --company=COMPANY_ID --through=2026-09-29 --report=transaction-preview.json
```

Apply after reviewing that report:

```powershell
npm run db:import-transactions -- --company=COMPANY_ID --through=2026-09-29 --apply --report=transaction-import.json
```

Repeat `--company` for several companies. All selected companies commit together;
any error rolls back the whole batch. The script tests a second run before committing.
Rerunning unchanged history adds no journals or account movements.

## What it does

- Reads `money_transactions`, retains the old rows and uses exact source IDs.
- For PAID standalone transactions, reuses a verified `LEGACY_CASH_BANK_HISTORY`
  journal when present. It verifies provenance, company, currency, date, cash/bank
  account, direction, amount and balanced journal lines before linking it to the list.
- If absent, creates a balanced historical Receive/Pay journal with the original
  date, reference and note. Existing cash/bank accounts are reused; it does not
  create duplicate cash accounts or infer revenue/expense from a party-type label.
- Salary, staff-credit and distributor-owned money rows remain owned by their source
  integrations. They are reported as `owned-by-source`, not independently imported.
  This preserves the staff new-activity-only policy. Pending rows are reported and
  create no posted cash movement. This is not a historical salary import.
- Import audit metadata records the complete source fingerprint and journal link.
  Changed/deleted previously imported sources stop the batch. Do not delete sources.
- The report lists every row, created/reused counts and exact account balance changes.
  Company isolation, account types and locked dates are checked for new postings.
- The old Transactions route opens the new Receive/Pay page. Imported entries can
  be reversed there; the original journal and old source record remain for audit.
  Old transaction PUT/DELETE refuses migrated standalone rows.

## Missing purpose accounts / named banks

For entries not covered by the earlier cash/bank import, copy
`transaction-mappings.example.json` and replace the placeholder IDs with explicit mappings:

```json
{
  "COMPANY_ID": {
    "banks": { "OLD_BANK_ID": "NEW_BANK_ACCOUNT_ID" },
    "money": { "CASH": "NEW_CASH_ACCOUNT_ID", "BANK": "NEW_PRIMARY_BANK_ID" },
    "purposes": { "OLD_TRANSACTION_ID": "NEW_PURPOSE_ACCOUNT_ID" }
  }
}
```

Pass `--mappings=transaction-mappings.json`. `defaultPurpose` is also supported per
company when an accountant has chosen one counterpart for all unmatched entries.
Named banks reuse an unambiguous existing distributor bank mapping; otherwise an
explicit mapping is required. All target accounts must belong to the same company.
Existing journals are never recategorized by these mappings; conflicting choices fail.

Alternatively, explicitly pass `--migration-clearing` to offset missing-purpose
entries to the existing/new **Legacy cash/bank migration clearing** equity account.
This transfers historical money movements without claiming that they are sales,
expenses or customer invoice collections. It does not mark invoices paid.

Verification: `npm run test:transaction-history` runs real database checks and rolls
back fixtures. Preview again after apply: created/reused should both be zero.
