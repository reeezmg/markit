# Current stock accounting

Run from Storetools with the target database configured in DATABASE_URL. Requires
installed Accountant, distributor and ERP accounting and enabled ERP companies.

```powershell
npm run db:stock-accounting
npm run db:reconcile-stock -- --all-connected
# Review stock-accounting-preview.json, then apply:
npm run db:reconcile-stock -- --all-connected --apply
```

For selected companies, replace `--all-connected` with one or more `--company=<id>`.
`--report=<file>` overrides the JSON report path. Preview rolls back all changes.
Apply is atomic across the selected companies and locks source tables during the
cutover. Failure rolls back the entire run. Repeating an unchanged run posts nothing.

Stock value = remaining item quantity ? current variant purchase price, rounded to
2 decimals per Stock account. A posted PO's saved Stock mapping is reused; products
without an accounting PO (including no PO at all) use the company's ERP Stock account.
This does not create purchase debt or payments for stock lacking purchase documents.
Existing native purchase/return/sale postings are counted before calculating the gap.

The first gap is posted at the run date against Opening Inventory (equity), with
full product/PO/item/cost evidence. Subsequent quantity/cost/linked-journal changes
post any remaining gap automatically against Inventory Adjustments (expense).
Existing source records and journals remain intact. No historical as-of balances
are restated; current balances are brought into agreement. This is current-cost
valuation, not FIFO or a reconstruction of historical acquisition costs. Sale
prices and sales discounts do not change stock cost. Purchase discounts only change
the target when included in variant purchase price. Negative stock remains negative.

Stock is source-controlled after activation, so editing a manual Stock journal
cannot permanently override product valuation. Edit product quantities/costs instead.
Date locks and invalid account mappings reject the source transaction atomically.
Journal details show source product and PO links; the JSON report also retains them.

Validation:
```powershell
npm run test:stock-accounting
npm run test:products-distributor-accounting:api
node scripts/verify-source-accounting-current.mjs
```
The API suite uses real handlers and installed database triggers with all fixture
writes rolled back; it does not exercise browser login.
