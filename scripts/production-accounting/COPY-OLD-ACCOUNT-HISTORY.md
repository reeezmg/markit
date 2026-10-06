# Copy old transfers, transactions and investments

Run from `storetools` with the intended `DATABASE_URL`. The single entrypoint is
`copy-old-account-history.ts`. The old three import CLI files were removed; npm
import commands and the production runner use this entrypoint. Existing tested
transfer/transaction library engines and the investment domain importer remain.

```powershell
# Preview the complete ORIGINALS CLOTHING replacement; database rolls back.
npm run db:copy-old-account-history -- --company=6980e6e4-7d5d-413c-9554-24f385c9b853 --through=2026-10-02 --reset --report=../artifacts/account-history-preview.json

# Apply the same replacement with a new, exclusive backup filename.
npm run db:copy-old-account-history -- --company=6980e6e4-7d5d-413c-9554-24f385c9b853 --through=2026-10-02 --reset --apply --backup=../artifacts/account-history-backup.json --report=../artifacts/account-history-applied.json
```

`--reset` is restricted to ORIGINALS CLOTHING and all three areas together. It
deletes imported and native new transfer records, money journals and investor
events/journals (including profit allocations and reversals). Related import and
allocation retry metadata is removed and saved in the backup. Investor profiles,
chart accounts, ownership terms, source tables and other accounting domains remain.
Original cash-history transfer journals remain available to the verified importer;
their old replacement reversals are removed and recreated to prevent duplicate
movement. Reused money cash-history journals are removed and recopied as explicit
Receive/Pay journals.

Deletion and recopy share one transaction. A failed copy rolls back deletion. Apply
requires a backup written before deletion using exclusive creation, so an existing
backup cannot be overwritten. The backup includes old source rows, account setup,
new records, journals/lines and audit records for this company. Date locks remain
enforced. A reset cutoff must include every original source row.

Old transfers keep amounts, timestamps, account direction and bank mapping.
Unidentified INVESTMENT transfer legs retain migration clearing. Paid standalone
money transactions are copied; source-owned payments remain owned by their source,
and pending transactions do not post. Completed investments use the saved CASH or
primary BANK method as counterpart by default; pending investments stay unposted.
Investor event dates use Asia/Kolkata by default (`--time-zone` overrides it).

`--mappings` supports company-keyed `transfers`, `transactions`, and `investments`
objects using the existing library mapping contracts. Explicit mappings override
defaults. Without `--reset`, adoption is incremental; `--only=transfers`,
`transactions`, or `investments` selects one area. Transfer `--verify` is read-only
and requires `--only=transfers`. Repeated adoption is checked for no new movement;
all published journals are checked for balance and reset verifies unchanged sources.

The reset transfer path uses `lib/copy-transfers-batch.mjs`, keeping the existing
import identifiers/fingerprints and checking original journal provenance, bank
mapping, reversal lines and aggregate balance movement. Its integration fixture
also verifies that the incremental importer recognizes the batch as unchanged.
