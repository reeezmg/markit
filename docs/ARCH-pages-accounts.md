### Accounts (`/accounts`)

**Files:**
- `pages/accounts/cash.vue` — Cash ledger (date-filtered, PDF export)
- `pages/accounts/bank/index.vue` — Bank accounts list (primary + secondary)
- `pages/accounts/bank/[id].vue` — Bank ledger for a specific bank account
- `pages/accounts/tax.vue` — Tax account, bill-wise tax collected from bill entries
- `pages/accounts/investment.vue` — Capital investments / withdrawals
- `pages/accounts/transfer.vue` — Account transfers (cash ↔ bank ↔ investment)
- `pages/accounts/transaction.vue` — Money transactions (give/receive)
- `components/Accounts/Form.vue` — MoneyTransaction add/edit form
- `components/Accounts/List.vue` — MoneyTransaction list with filters
- `components/Bank/Form.vue` — BankAccount add/edit form
- `components/Investment/Form.vue` — Investment add/edit form
- `components/AccountTransfer/Form.vue` — AccountTransfer add/edit form

**Server API routes (ALL raw SQL via `pg` pool):**

| Route | Purpose |
|---|---|
| `GET /api/accounts/cashledger` | Cash ledger with running balance for date range |
| `GET /api/accounts/primaryledger` | Primary bank ledger (bank on `companies` table) |
| `GET /api/accounts/secondaryledger?bankId=` | Secondary bank ledger (from `bank_accounts`) |
| `GET /api/accounts/taxledger` | Computed tax account from `entries` joined to `bills` |
| `GET /api/accounts/cash-ledger.pdf` | PDF download of cash ledger |
| `GET /api/accounts/bank-ledger.pdf` | PDF download of bank ledger |
| `POST/PUT/DELETE /api/accounts/transactions` | Money transaction writes with account-ledger rebuild |
| `POST/PUT/DELETE /api/accounts/transfers` | Account transfer writes with account-ledger rebuild |
| `POST/PUT/DELETE /api/accounts/investments` | Investment writes with account-ledger rebuild |
| `POST/PUT/DELETE /api/accounts/banks` | Secondary bank writes/opening ledger rebuild |
| `PUT /api/accounts/primary-bank` | Primary bank details/opening ledger rebuild |
| `POST/PUT/DELETE /api/accounts/expenses` | Expense writes with account-ledger rebuild |

**ZenStack hooks used:**
- `investment.vue`: `useFindManyInvestment` for list reads; create/update/delete use `/api/accounts/investments`.
- `transfer.vue`: `useFindManyAccountTransfer`, `useFindManyBankAccount`, `useFindUniqueCompany` for reads/options; create/update/delete use `/api/accounts/transfers`.
- `transaction.vue`: form writes use `/api/accounts/transactions`; `components/Accounts/List.vue` still reads with `useFindManyMoneyTransaction`, bulk status uses `/api/accounts/transactions/status`.
- `bank/index.vue`: `useFindManyBankAccount`, `useFindUniqueCompany` for reads; create/update/delete use `/api/accounts/banks`, primary edit uses `/api/accounts/primary-bank`.

**Tables touched (all via raw SQL):** `companies`, `bills`, `expenses`, `money_transactions`, `account_transfers`, `bank_accounts`, `distributor_payments`, `distributors`, `distributor_companies`

**Persisted account ledger table:** `account_ledger_entries`

**Schema-ensure is process-cached (perf):** `ensureAccountLedgerSchema` (`server/utils/account-ledger.ts`) holds the idempotent setup DDL (enum types, table, indexes). It used to run on **every** ledger write (~11 no-op round-trips each; `bill/create` triggered it twice — once directly, once inside `rebuildAccountLedgerForSource`). It now runs **once per process** via a `schemaReady` flag + serialized `schemaPromise`, on its own pooled (autocommit) connection so the schema is durably committed regardless of caller transaction. Both `bill/create` and `bill/update` dropped their redundant direct call and gate their one-off `bills.discount_type` column-add behind a module flag too.

**Round-trip batching in `rebuildAccountLedgerForSource`:** the old `SELECT … FOR UPDATE` + separate `DELETE` are now a single `DELETE … RETURNING` (the returned rows drive the balance-recalc; DELETE already locks them), and the per-source ledger rows are written with one **multi-row INSERT** instead of one query per row (matters for split-payment / multi-account sources). In `bill/create` and `bill/update`, the coupon write-pairs (`coupon_usages` INSERT/DELETE + `coupons.times_used` +/-1 UPDATE) are each merged into one data-modifying CTE. (Note: the `Promise.all(updatePromises)` in `bill/create` is *not* true parallelism — they share one connection, so node-pg serializes them; it's just batched issuing, not concurrent execution.)

**Credit account:** `pages/accounts/credit.vue` fetches `GET /api/accounts/creditledger`, which reads `account_ledger_entries` rows where `accountType='CREDIT'`. Bill credit rows are written from `bills.paymentMethod='Credit'` and split-payment `Credit` portions. Payment-method changes append adjustment rows instead of replacing the original bill row: the old account is debited and the new account is credited. Manual user-credit rows and payroll credit cuts mirror into the same account with `sourceType='USER_CREDIT'`.

**Computed tax account:** `pages/accounts/tax.vue` fetches `GET /api/accounts/taxledger`, which groups bill entries by bill and computes taxable value/tax using the same tax-inclusive formula as GSTR-1 (`entries.value`, `entries.tax`, `bills.created_at`, and `session.isTaxIncluded`). This page is derived from `entries`/`bills`; it does not write rows to `account_ledger_entries`.

---

#### Two-Tier Bank Architecture

The system has two distinct kinds of bank accounts:

| Type | Storage | Edit path |
|---|---|---|
| **Primary bank** | Fields directly on `companies` table (`bankName`, `accHolderName`, `accountNo`, `ifsc`, `gstin`, `upiId`, `bank` = opening balance, `openingBankDate`) | `PUT /api/accounts/primary-bank` |
| **Secondary banks** | `bank_accounts` table with `openingBalance` and `openingBalanceDate` | `POST/PUT/DELETE /api/accounts/banks` |

- `bank/index.vue` merges both into one list — primary is always shown as a synthetic row with `isPrimary: true`, using company bank fields when present and a `Primary Bank` fallback when blank
- Primary bank **cannot be deleted** (delete button disabled)
- Edit routing: `isPrimary → editPrimaryBank()` (updates Company), else `editSecondaryBank()` (updates BankAccount)
- Ledger routing: `/accounts/bank/primary` → `primaryledger`; `/accounts/bank/{id}` → `secondaryledger?bankId={id}`

---

#### Persisted Ledger Calculation (raw SQL, `pg` pool)

`account_ledger_entries` is the account ledger source of truth. Ledger APIs compute opening as the sum of persisted rows before `from`, fetch persisted rows between `from` and `to`, and return stored `balanceAfter` as the running balance. `CREDIT` increases account balance and `DEBIT` decreases it.

**Credit ledger row sources:**

| Source tag | Table | Debit | Credit |
|---|---|---|---|
| `BILL` | `bills` (paymentMethod=Credit) | 0 | grandTotal |
| `BILL` | `bills` (paymentMethod=Split, Credit portion) | 0 | split amount |
| `BILL` | bill payment-method change away from Credit | previous credit amount | 0 |
| `USER_CREDIT` | `user_ledger_entries` (`CREDIT_BILL_PAYMENT`) | amount | 0 |
| `USER_CREDIT` | `user_ledger_entries` (`USER_CREDIT_BILL`, non-bill source) | 0 | amount |

**Cash ledger opening balance:** `accountLedgerRowsForApi` sums signed `account_ledger_entries` before `from` for the company and CASH account. It does not recalculate the opening value by querying bills, expenses, transfers and transactions on each read. Source writes rebuild the persisted ledger entries.

**Cash ledger row sources:**

| Source tag | Table | Debit | Credit |
|---|---|---|---|
| `OPENING` | — | 0 | openingBalance |
| `BILL` | `bills` (paymentMethod=Cash) | 0 | grandTotal |
| `BILL` | `bills` (paymentMethod=Split, Cash portion) | 0 | split amount |
| `EXPENSE` | `expenses` (paymentMode=CASH, status=PAID) | totalAmount | 0 |
| `MONEY_TRANSACTION` | `money_transactions` (CASH, PAID) | amount if GIVEN | amount if RECEIVED |
| `ACCOUNT_TRANSFER` | `account_transfers` (CASH involved) | amount if from_type=CASH | amount if to_type=CASH |

Salary payments and manual staff-credit rows flow into these account ledgers through `money_transactions`: salary payments are `EMPLOYEE/GIVEN/PAID`, manual `USER_CREDIT_BILL` rows are `EMPLOYEE/GIVEN/PAID`, and manual `CREDIT_BILL_PAYMENT` rows are `EMPLOYEE/RECEIVED/PAID`.

**Primary bank ledger:** Same structure but tracks `BANK`/`UPI`/`Card` payment modes (and split portions), `distributor_payments` (debit), `money_transactions` (bank mode), `account_transfers` (bank side).

**Important:** `is_markit = false` filter is applied on all bill queries in ledger APIs — **marketplace-originated bills are excluded from the cash/bank ledger**.

**Cash opening date guard:** `companies.opening_cash_date` — the `companies.cash` opening balance is only included if `opening_cash_date <= from`. If the opening date is after the `from` date, `baseOpening = 0` (date-range-aware).

**Primary bank opening date guard:** `companies.opening_bank_date` — the `companies.bank` opening balance is only included if `opening_bank_date <= from`. If the opening date is after the `from` date, `baseOpening = 0` (date-range-aware).

**Zero-opening behavior:** the ledger reader does not special-case a `companies.cash` or `companies.bank` value of zero. Its opening balance is the signed sum of persisted account-ledger rows before `from`; a zero opening-source row does not erase prior posted movement.

---

#### `pages/accounts/cash.vue` — Cash Ledger
- Fetches via `GET /api/accounts/cashledger?from=&to=` using Nuxt `useFetch`
- Shows: Opening Balance, Total Cash In (sum of period credits, excluding the synthetic OPENING row), Total Expenses (sum of EXPENSE debits only; other cash debits still appear in the ledger)
- Ledger table: Date, Source, Description, Debit, Credit, Balance
- Footer: Closing Balance
- PDF download: `GET /api/accounts/cash-ledger.pdf`
- Date picker with preset ranges (7d, 14d, 30d, 3m, 6m, 1y)
- **Soft-deleted row highlighting:** `styledLedger` computed adds `class: 'bg-red-50 text-red-600'` when `row.precedence === true`; `:rows` is bound to `styledLedger`. Current persisted-ledger rows from `accountLedgerRowsForApi` do not return `precedence`, so this class is inactive unless an API adds that field.

---

#### `pages/accounts/bank/index.vue` — Bank Accounts List
- Lists primary bank (synthetic row from `useFindUniqueCompany`) + secondary banks (`useFindManyBankAccount`) merged
- Primary row has `isPrimary: true` badge, delete button disabled
- Create secondary bank → `POST /api/accounts/banks`
- Edit primary bank → `PUT /api/accounts/primary-bank` (Company bank details/opening balance)
- Edit secondary bank → `PUT /api/accounts/banks/{id}`
- Delete secondary bank → `DELETE /api/accounts/banks/{id}`
- Click "Details" → primary opens `/accounts/bank/primary`, secondary opens `/accounts/bank/{id}`

---

#### `pages/accounts/bank/[id].vue` — Bank Ledger
- Route param `id = 'primary'` → fetches `GET /api/accounts/primaryledger`
- Route param `id = '{bankId}'` → fetches `GET /api/accounts/secondaryledger?bankId={id}`
- Same UI as cash ledger (date range, table, running balance, closing balance)
- PDF download: `GET /api/accounts/bank-ledger.pdf`
- **Soft-deleted row highlighting:** same `styledLedger` pattern as `cash.vue` — `class: 'bg-red-50 text-red-600'` when `row.precedence === true`. Applied on `primaryledger` API; `secondaryledger` is not affected (secondary bank rows don't come from `bills`).

---

#### `pages/accounts/investment.vue` — Investments
Reads with ZenStack hooks; writes use `/api/accounts/investments` so `account_ledger_entries` is rebuilt for the investment source row.
- `useFindManyInvestment` with `include: { user: true }`, ordered by `createdAt desc`
- Fields: `direction` (IN = invested, OUT = withdrawn), `amount`, `paymentMode`, `status`, `note`, `createdAt`, `CompanyUser`
- `CompanyUser` connected via compound key `companyId_userId`
- New investment: `status` hardcoded to `'COMPLETED'`
- Update investment: `status` taken from form

---

#### `pages/accounts/transfer.vue` — Account Transfers
Reads with ZenStack hooks; writes use `/api/accounts/transfers` so both affected account ledger rows are rebuilt for the transfer source row.
- `useFindManyAccountTransfer` ordered by `createdAt desc`
- Fields: `fromType` (CASH/BANK/INVESTMENT), `toType`, `amount`, `note`, `fromAccountId?`, `toAccountId?`
- `fromAccountId / toAccountId = null` → refers to the primary account of that type
- `fromAccountId / toAccountId = {id}` → refers to a specific `BankAccount`
- Display label: if type != 'BANK' → show type name; if BANK + id exists → `BANK (bankName)`; if BANK + null → `BANK (Primary)`
- Form uses `useFindManyBankAccount` + `useFindUniqueCompany` to populate dropdowns

---

#### `pages/accounts/transaction.vue` + `components/Accounts/List.vue` — Money Transactions
Reads with ZenStack hooks; create/update/delete and bulk status changes use `/api/accounts/transactions*` so `account_ledger_entries` is rebuilt for each money transaction source row.
- Filters: `partyType` (CUSTOMER/SUPPLIER/EMPLOYEE/OWNER/OTHER), `direction` (GIVEN/RECEIVED), `status`, date range
- Optional `accountId` field: links to a specific BankAccount (if paymentMode is BANK)
- No explicit `companyUser` link on MoneyTransaction — only `companyId`

---
## Other finance views

### `pages/accounts/tax.vue`

Read-only tax account for a selected date range. It calls `/api/accounts/taxledger` and presents tax totals, bill-level ledger rows and a rate summary. Values are derived from bill entries rather than edited on this page; changing a bill is done in the sales editor.

### `pages/accounts/credit.vue`

Credit-account ledger for the selected date range. Calls `/api/accounts/creditledger`, showing opening, movement and closing balance from persisted CREDIT ledger entries. It is a financial account view, not the staff-specific credit register at `pages/users/credit-bills.vue`.
