# Old account transfers into new Account Transfers

Run from Storetools with the target DATABASE_URL and current accounting schema/setup.

```powershell
# Preview: changes and repeat checks roll back.
npm run db:import-transfers -- --company=COMPANY_ID --through=YYYY-MM-DD --report=transfer-preview.json

# Apply atomically for all selected companies.
npm run db:import-transfers -- --company=COMPANY_ID --through=YYYY-MM-DD --apply --report=transfer-import.json

# Read-only verification of source rows, transfer records and posting lines.
npm run db:import-transfers -- --company=COMPANY_ID --through=YYYY-MM-DD --verify --report=transfer-verification.json
```

Repeat `--company` for multiple stores. The main production runner includes `transfers`
after `transactions`. Run after Cash/Primary Bank adoption; never replay the old cash
import after transfer replacement. Existing source rows remain unchanged.

Each old transfer gets a new transfer record, readable TRF number, original date,
amount, note and source reference. The journal debits the destination and credits
the origin. If cash-history journals already represent the transfer, the importer
verifies their provenance, date, currency, amount and counterpart, reverses them,
and posts the complete transfer. Historical journals remain visible for audit.
This adds named-bank legs previously represented by migration clearing without
posting cash/primary-bank movement twice. The JSON report lists exact balance changes.

Cash and Primary Bank reuse ERP mappings. Named banks reuse an unambiguous existing
bank mapping. Old INVESTMENT transfers contain no investor identity: the importer
preserves their proven migration-clearing counterpart; it never assigns an investor.
Unmapped accounts require an explicit mapping file (`--mappings=FILE.json`):

```json
{
  "COMPANY_ID": {
    "cash": "NEW_CASH_ACCOUNT_ID",
    "bank": "NEW_PRIMARY_BANK_ID",
    "banks": { "OLD_BANK_ID": "NEW_BANK_ACCOUNT_ID" },
    "investment": "NEW_INVESTMENT_COUNTERPART_ID"
  }
}
```

Omit mappings already available from existing setup. Explicit mappings must use
accounts in that company and cannot silently change an already imported transfer.
The script checks a second run before committing. Unchanged runs add no records or
balance movements. Changed/deleted old rows, changed imported records, missing
journals, wrong mappings, existing unrelated reversals and locked posting dates fail
the batch. Imported records are read-only in the new page and old mutation endpoints;
record a new correcting transfer when necessary. New transfers remain editable.
The old Transfers page shows read-only original history and links to the new Account Transfers page.

Tests: `npm run test:transfer-history` (isolated schema, rolled back) and
`npm run test:accountant` (transfer listing and edit/delete protection).
