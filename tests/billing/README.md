# Billing and bill-edit regression tests

From `storetools`, run:

```sh
npm run test:billing
```

The runner discovers every `*.test.ts` in this folder, includes the existing billing
error tests, fails on any failing assertion and writes `reports/latest.json` and
`reports/latest.tap`. The browser test also saves billing/edit footer screenshots.
Reports are ignored by Git. No Nuxt server, login, `.env` or database is required.
Dependencies come from the existing Storetools installation (`npm ci`).

The browser test needs Chrome or Edge. On another machine, set
`BILLING_TEST_CHROME` to the browser executable if it is not found automatically.
It launches a hidden browser with an isolated temporary profile and serves fixtures
only on `127.0.0.1`; the profile and server are cleaned up afterward.

## What is exercised

| Test file | Behaviors |
|---|---|
| `totals-drafts.test.ts` | Billing/edit totals, percentage/flat/surcharge discounts, returns, redemption, quantity count, date editing, company storage isolation, draft creation/switching/persistence/deletion/reset and five-draft limit |
| `items.test.ts` | Row discounts, included/excluded and fixed/variable/subcategory tax, category deduplication, staff inheritance, blank rows, backspace, zero-stock barcode lookup, invalid barcode, stale request race, selected products and returns |
| `save-edit.test.ts` | Cash/UPI/card/credit/split payloads, category/staff links, discount modes, empty/category/quantity/rate/total/payment/date/loading/offline validation, receipt actions, double submission, server failures, request UUID reuse, edit removal IDs and bill deletion |
| `clients-coupons.test.ts` | Client matches, phone normalization, creation selection, redemption/undo, stale searches, coupon date/activity/minimum/global/client/audience/generated limits, percentage/cap/flat/gift values, clearing coupons, split confirmation |
| `navigation-loading.test.ts` | Barcode/category/subcategory shortcuts, discount/payment/save keyboard focus, row/parent staff tracking, persisted edit categories/IDs/discount/client/credit/points/splits, mock native/web scanner dispatch, item network errors |
| `dialogs-receipts.test.ts` | Account creation/validation/errors, client create/link/duplicate-phone recovery/errors, product-selection emit/reset, return-selection emit, printer success/failure, missing receipt phone and generated-coupon sending |
| `loading-layout.test.ts` | Owner/category load ordering, cancelled owner selection, page/dialog Vue compilation, minimum header+one-row measurements, resize and observer cleanup |
| `browser.test.ts` | Actual desktop summary templates with native UI stand-ins: five columns, stacked totals, uniform field font, one-word labels, text-only New/Search, phone/icon row, modal-opening bindings and panel/table scrolling at 1280×720, 1024×600 and 1280×280 |
| `../billing-error.test.ts` | Offline/network/timeout messages, clean validation, technical-detail filtering, expired session and rate limiting |

## How the tests work

`harness.ts` uses TypeScript's parser to execute actual declarations from the Vue
pages, or entire composables, with real Vue refs/computed/watchers. It supplies
explicit in-memory request/storage/device mocks; unknown requests fail closed.
It does not import server routes or database clients. The browser compiles and mounts
the current summary template and loads the shared billing CSS. Its surrounding page
shell and Nuxt UI controls are stand-ins, so screenshots are fixture screenshots.

## Coverage limits

Passing this suite is **not a claim of 100% application or line/branch coverage**.
It verifies the listed scenarios. Full authenticated Nuxt navigation, real Nuxt UI
dropdown/modal behavior, the mobile stacked forms, production record contents,
server transactions/stock/accounting, physical camera/printer behavior, actual PDF
generation and external WhatsApp/notification delivery remain integration/manual
checks. Save/update bodies and receipt dispatch are tested with mocked services;
real records are never created, changed or deleted. The tests do not create or alter
database schemas. Do not combine this runner with database-writing integration tests.
