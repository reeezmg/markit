# Warranty, guarantee and maintenance

## Ownership and entry points

The authenticated **After-sales** navigation group is available in ERP and Storefront
menus when the company's **Enable after-sales** setting on `/settings/branches` is on.
It defaults to disabled and is stored as `includeAfterSales` in the existing
`GeneralPreference` `sales-workflow/defaults` JSON. Turning it off hides both sidebar
groups, product service classification/coverage selectors, billing registration,
invoice unit controls, client/order service-history links, customer-product numbering,
and Accountant ecommerce service-unit inputs. Disabled controls do not mount their
service components or perform their optional service reads. Direct workspace visits
show a disabled notice instead of mounting service pages. Existing records and API
authorization remain intact; settings still allow an explicit opt-in.
`useAfterSalesFeature` resolves the owning company, including each row in mixed-company
tables, and shares saved workflow state with the sidebar/settings. Late reads cannot
undo a save, cross the requested company scope or update after unmount.
`/after-sales` is the staff service workspace; `/after-sales/maintenance`,
`/after-sales/warranty` and `/after-sales/guarantee` manage reusable configurations.
Client product detail is `/after-sales/products/:customerProductId`. Client,
invoice-edit and ecommerce-order links retain the owning company and optional
client/bill/order filters. These are seller screens, not customer self-service APIs.

Client row Actions → Service history opens `/after-sales/customers/:clientId` in the
row's owning company. `AfterSales/CustomerHistory.vue` lists registered physical units
(including manual/history records) and remaining unregistered stock quantities from
non-deleted sale bills. Registered units replace their source entry quantity instead
of being listed twice; labour/non-stock charges and return lines are excluded from
unregistered purchases. Purchase rows retain source names/barcodes when possible.
Actions → View opens the existing customer-product detail with `entryCompany`.
Unregistered purchases are labelled and must be explicitly registered before service;
opening this history never backfills customer units or changes existing agreements.

Visible After-sales labels, reference-numbering settings and validation messages use
Client/Client products. Existing CustomerProduct models, API paths and payload keys
retain their technical names for compatibility.

The screens use the same Nuxt UI / UI Pro components and app-configured primary color
as `/erp/sales`: `UDashboardPanelContent`, `UCard`, `UTable`, table toolbars, badges,
column selection and pagination. `AfterSales/RecordTable.vue` owns in-memory sorting,
10/20/50-row paging, column visibility and empty/loading states for the API's returned
records (it does not imply a server-side total beyond the existing API limits).
Workspace summary cards select client products, due/overdue maintenance or open jobs;
search/status filters operate on returned records, with debounced server search to
find matches beyond the initial result limit. Products, due visits and jobs apply
client/bill/order filters in SQL before their result limits. Jobs and maintenance
accept `q` server searches; the active tab supplies its query, independently of the
other tab lists. Contextual visits/jobs do not depend on the first 200 loaded units.
Parent route keys
include path/company, and pending list loads discard stale responses. Single-company
selectors live in the shared navbar and lock while editing or posting a mutation.

Plan editing uses a structured card form for activation, schedule, coverage, charges,
checklists, custom fields and reminders; amendments show changed terms and a selectable
customer preview. Charge editing and manual registrations use `UModal`. Product detail
groups agreements in cards and separates jobs, readings and audit history. Visits/claims
use a `USlideover` with a scrolling form and persistent total/action footer; closing by
outside click is blocked while a job is saving. The table search, status filters,
labelled inputs and row actions use native Nuxt UI behavior, including dark mode.
`utils/after-sales-display.ts` provides readable status labels, India dates, company
currency formatting and local search. Embedded product/billing selectors use the same
UI controls. The former separate teal stylesheet has been removed.

Manual registration's `CustomerSelect` loads the first 20 company-linked clients without
requiring typing, then searches names/normalized phone numbers through the existing
`/api/bill/findManyClient` lookup. Loading, empty and retryable error states are distinct;
company changes reset the selection and discard responses from the previous company.

`/after-sales/items` manages reusable non-stock charges and stocked service products.
`AfterSales/Items.vue` lists/edit/archives charge defaults (name, description, rate before
tax, tax and unit). Service products use the normal `/products/add` and edit screens,
opened with `serviceProduct=true`; drafts, staging, raw product writes and reads retain
`Product.isServiceProduct`. They share `products`, `variants`, `items`, purchases and
stock handling with regular products. The flag is a classification, not a separate
inventory or publication rule. Both kinds of product are searchable in service jobs.
`ServiceCharge` is API-owned/company-scoped; archived charges cannot be newly selected.
Existing jobs retain copied names/prices, including archived or subsequently edited
charges. Custom one-off charge lines are also supported.

Saving a charge ensures one company-owned **Service Charges** category, with an
after-sales transaction advisory lock preventing duplicate first-time saves. It
reuses a case-insensitive, trimmed name match and restores an inactive match without
changing its tax settings. `GeneralPreference` at `after-sales/service-charge-category`
stores `{version:1,categoryId}`, so a renamed category remains associated. Creation
and restoration are audited with the charge save in the same transaction. The charge
form shows this automatic category; catalogue reads return `chargeCategory` without
creating records. This uses existing tables and requires no schema installation.

`components/AfterSales/Configurations.vue`, `RulesEditor.vue`, `ProductSelector.vue`,
`SaleRegistration.vue`, `JobEditor.vue` and `ValuesEditor.vue` own the forms. The product
Create component embeds the multi-selector; product drafts preserve the IDs. Product
read, update, create and batch-save APIs persist links in their source transactions.
Archived configurations cannot be newly linked; existing links continue to apply.

## Configuration and agreement contracts

`utils/after-sales.ts` validates three configuration kinds. WARRANTY and GUARANTEE
share configurable duration, provider, start rule, coverage, exclusions and claim
instructions; neither label implies automatic legal remedies. Product links apply
across variants and allow multiple configurations of every kind.

MAINTENANCE supports explicit dates, one-time visits and recurring DAY/WEEK/MONTH/YEAR
intervals. Start offsets use sale, delivery, installation or a specific date. Calendar
recurrence retains its original month-end anchor; completion recurrence starts its next
interval on actual completion. Optional end dates, completed-visit limits, free visits,
default charges/tax, reminder offsets and manual instructions/checklists are independent
of warranty/guarantee expiry. Custom NUMBER/TEXT/DATE/BOOLEAN fields can include a unit
and a required-on-completion flag. **Only dates drive due status**; readings never
automatically evaluate numeric thresholds. Operational dates use Asia/Kolkata.
Recorded readings retain their field definitions so later configuration edits do not
change the meaning of historical values. Activation normalizes both the declarative
timestamp contract and the ecommerce bootstrap's timestamptz timestamps to India dates.

Configuration creation/edits append immutable revisions. Every edit requires FUTURE
or SELECTED application and a reason. SELECTED requires a server-generated preview
token and explicit agreement IDs. The token fingerprints the current configuration,
proposed terms and affected agreement state, rejecting stale previews. Amendments change
remaining obligations; completed work, booked jobs' snapshots and invoices are retained.
Unbooked open occurrences are cancelled and the new schedule can regenerate them.

`schema.zmodel` owns ServiceConfiguration, ServiceConfigurationRevision,
ProductServiceLink, CustomerProduct, CustomerServiceAgreement, MaintenanceOccurrence,
ServiceJob, ServiceReading, ServiceAudit and ServiceReminder. Generated model access
is denied; dedicated authenticated SQL APIs own reads and mutations. All records carry
company ownership. Source catalog/customer/document IDs are retained as scalar history
references so deleting a catalog item/document cannot cascade through service history.

## Sales and activation

`server/utils/after-sales-lifecycle.ts` runs inside existing caller transactions.
`create-bill-source.ts` registers covered POS sales, and `ecomm-order-create.ts`
registers seller-created ecommerce orders only when that company's `includeAfterSales`
is enabled. Disabled companies skip new automatic registration and its additional
client/whole-unit requirements. Existing-unit edit, return, cancellation and activation
protections remain in place. The public checkout calls
`ecommerce-api/api/app/after_sales.py::register_bill` only after a real order exists;
positive-total payment intents create no registrations. Existing idempotent source-save
and settlement paths retain their behavior.

On `/erp/billing` and `/erp/edit/:salesId`, an icon next to each row's Delete action opens the **Serial number
and activation dates** modal, on desktop and mobile. Covered products have optional
serial, delivery and installation fields per unit. Confirm stages values on the
draft; Cancel discards modal edits. The separate column and registration panel are
absent. Bill edit keeps existing-unit history and removal selection in a toolbar
dialog; existing unit serial/date corrections still use service history.
`useBillingSerialNumbers` stores per-unit details and
stable line keys on the existing company-local draft rows, separates duplicate
product lines, prunes removed units and maps values to the unchanged `serviceUnits`
payload. Return rows select the exact registered units in the modal. POS registration
accepts optional delivery dates in the existing `delivered_on` field; ecommerce
registration ignores supplied delivery dates and retains order/carrier activation.
Save awaits
the current coverage read, and the client requirement stays enforced. All of these
controls remain hidden when after-sales is off. Invoice-edit registration controls
and installation updates in the service workspace retain their existing behavior.

Covered sales require a company-linked customer and positive whole-unit quantities.
Each unit gets its own reference, optional serial, and one snapshot per linked
configuration. Bill-entry/unit source keys and a per-company transaction advisory lock
prevent duplicate registration. POS line keys disambiguate multiple lines for the same
stock item. POS defaults to sale activation; ecommerce defaults to delivery. Required
installation dates leave agreements pending. Earlier purchases can be registered by
staff using purchase evidence and explicit dates; there is no historical auto-backfill.

Settings > Numbering includes Customer product references. The default prefix is `PR`
and references use six-digit minimum padding (`PR-000001`, `PR-000002`), with one
transactional bigint counter per company across manual registration, POS and ecommerce.
`CustomerProductNumbering` stores prefix/lastNumber; prefix changes lock the same row as
allocation, are audited, and never reset the counter or rewrite issued references.
Repeated source registration consumes no numbers. Financial-year resets do not affect
this counter. UUIDs remain the internal route/relationship IDs. References are unique
within each company, so two companies can both issue `PR-000001`.

Migration `20261030213000_customer_product_numbering` is prepared locally and requires
separate authorization to install; the audit/test commands never apply it.
It creates the counter table and replaces global reference uniqueness with company
uniqueness without updating historical units. Until it is separately authorized and
installed, registration retains the legacy `MP-<uuid>` format; the settings section
shows a setup notice and disables changes. There is no startup/runtime schema installer.

Manual order delivery, carrier webhooks, public tracking and private seller tracking
activate the same stored agreements. Seller tracking now runs inside Nuxt TypeScript
(`server/utils/shipping/index.ts`), reusing `activateServiceAgreements` from
`after-sales-lifecycle.ts`; the public ecommerce API retains its Python helper.
First recorded delivery is retained;
repeated events never restart coverage. Staff can correct dates with a recorded reason.

Invoice edits reconcile registrations and require explicit removed unit IDs before
reducing quantities or changing a covered entry's product/stock identity. Customer
reassignment cannot silently move existing units. Explicit removal cancels the old
unit with an `INVOICE_UNIT_REMOVED` audit; its history stays with its original client,
and a corrected client/product can receive a new registration. Unchanged returned,
replaced or source-cancelled units still occupy their original sale quantity: a later
edit, including after bill restoration, must not create fresh coverage for those units.
The invoice removal selector includes active and replaced originals; its help explains
that removing a replaced original ends carried coverage. Returned units cannot be
freed through invoice removal. Repeating an already audited edit removal is allowed.
POS returns and physically received Accountant ecommerce returns require the exact
registered units. A return request/approval alone does not cancel coverage. Both bill
deletion handlers, hard-deletion cleanup, seller cancellation and approved customer
cancellation end remaining obligations while retaining history. Replacement links
the original unit to a newly registered, same-customer unit. Carry-forward moves the
original agreements/history and cancels the replacement's initial agreements; an
explicit restart keeps the replacement's new agreements. A replacement with its own
service history is rejected.
Source cancellation traverses audited carry-forward replacement links, cancelling
their remaining agreements, due occurrences and open jobs; it stops at an explicit
restart. The Nuxt and public ecommerce Python lifecycle helpers share this rule.
Public checkout also honors the company's strict boolean `includeAfterSales` opt-in;
changing that setting does not prevent cancellation of existing obligations.

Replacement requires an active original unit. Restarting coverage cancels its open
jobs and due occurrences while retaining completed evidence. Carry-forward retires
the target's initial occurrences as well as its initial agreements. Product-detail
readings and audit history follow audited carry-forward replacement links, including
multiple replacements, without rewriting the evidence's original unit. A recorded
restart stops that history traversal. Detail history includes service invoice audits.

## Service jobs and scheduling

Claims record complaint, assessment, decision, assignment, notes and resolution. Visits
record appointment, checklist answers, readings, completion, charges and optional
catalog parts. Completed/closed jobs retain their snapshots. Completion advances the
schedule and increments the completed-visit count once; cancellation does neither.
A cancelled occurrence job releases the booking slot so staff can book it again.
Completed job dates are returned as date-only text in both detail and job lists;
JSON serialization must not shift a local PostgreSQL date to the previous UTC day.
Job lists, detail history and the job editor display the job's saved plan name, so
later agreement amendments do not relabel previously booked or completed work.

`GET /api/after-sales/staff` returns active company memberships as `{ id, name }`, where
`id` is the User ID and the display name comes from `company_users.name` (falling back
to account email when blank). Inactive/deleted memberships and cleanup users are
excluded; job assignment validates the same eligibility on the server.

Service invoicing is an explicit action, uses existing `issueProgramInvoice` and bill
source/accounting behavior, and stores one invoice ID on the job under a transaction
lock. Service charges are non-stock lines; selected catalog parts use normal stock
processing at invoice issuance. Completion itself never creates payments or journals.
Issuance also ensures the category for custom, legacy and zero-charge services, then
assigns it to non-stock charge entries only. Parts retain their product categories.
`billEdit/findUniqueBill` identifies linked service invoices and returns the default
category for uncategorized legacy charges. The editor supplies that default when
available; saving persists it. Reads do not backfill issued entries. Service charge
rows preserve their entered tax and inclusive rates instead of recalculating them
from category settings or adding company-exclusive tax a second time.
Deleting an issued service invoice does not silently issue a second invoice.

Jobs store multiple non-stock lines in `details.charges` and catalog product lines in
`details.parts`; each snapshots label, quantity, unit, tax-inclusive rate and tax.
`utils/service-items.ts` validates both line kinds and preserves legacy single
`charge`/`tax` jobs when no charge array exists. An explicit empty charge array means
no charges, without falling back to the legacy amount. Product ownership/identity is
validated on save and again when invoicing. Workspace/history totals include all lines.
Only saved COMPLETED visits or RESOLVED claims can first issue an invoice. After a
successful completion save, the product page reloads the saved job and asks whether to
create its invoice in a modal, including for zero totals. Create invoice calls the
existing invoice endpoint and opens billing; Later/dismiss reopens the saved job so
staff can invoice afterward. Open/in-progress saves and failed saves do not prompt.
The prompt locks while issuing, retains invoice errors for retry, and never creates an
invoice merely because a job was saved. Zero totals are allowed through an internal service
invoice option, including a descriptive zero line for an otherwise empty free service.
Free stock parts still consume stock at issue. Ordinary invoice callers continue to
require positive totals; editing an existing linked service invoice permits zero.
Invoice creation opens `/erp/edit/:billId` for existing printing, sharing and payment
tools. Creating/completing the job or creating its invoice never records a payment.

`processServices` generates date occurrences, preserves missed calendar visits and
deduplicates occurrence/lead-day reminders. Default offsets are 7 and 0 days. Late
runs catch up unsent reminders. Internal SYSTEM_ALERT notifications have no author;
the notification reader explicitly includes null-author system messages.
`GET /api/cron/after-sales` runs daily at 01:00 UTC (06:30 India time), requires the
existing CRON_SECRET bearer credential and returns per-company failures. The workspace
provides a company-scoped manual refresh. Occurrences and alerts commit together.

Company WhatsApp notifications are separately configurable from these internal alerts.
The committed-state scanner observes units, agreements, jobs and occurrences, grouping
activation by unit and rechecking cancelled/returned products and rescheduled visits
before sending. The Notifications tab under Connect owns client permissions, approved
templates, installation appointments and delivery activity. Installation completion
still uses the existing product date action. An admin/manager link opens Notifications
from the service workspace. See `WHATSAPP-NOTIFICATIONS.md`; the new notification schema
is prepared locally and is never installed by after-sales processing or tests.

## API and rollout

All `/api/after-sales/*` operations require a seller staff role, authorize the requested
company, and validate related ownership. Endpoint groups:

| Path | Methods / behavior |
|---|---|
| `configurations` | GET search/list; POST create/edit with application scope |
| `configurations/preview` | POST proposed terms and affected agreements, without mutation |
| `configurations/archive` | POST archive/restore |
| `links`, `sale-context` | GET company-owned product/configuration links |
| `products` | GET customer/bill/order-filtered units; POST manual registration |
| `products/:id` | GET agreements, jobs, readings and change history |
| `customers/:id` | GET company-linked customer and paginated purchased products / registered units; `q`, `page` (default 1), `pageSize` (10/20/50, default 20); returns `customer`, `rows`, `total`, `page`, `pageSize` |
| `products/update` | POST audited dates/readings/return/cancel/replacement actions |
| `maintenance`, `jobs`, `staff` | GET due occurrences, service jobs or active assignees |
| `jobs` | POST create/update a claim or visit |
| `jobs/invoice` | POST issue/reuse the job invoice |
| `catalog` | GET searched company-owned charges and service products |
| `catalog/charges` | POST create/edit/archive/restore a reusable charge |
| `process` | POST refresh company due work and internal reminders |

Both `maintenance` and `jobs` accept `q`, `clientId`, `billId` and `orderId` filters;
`maintenance` additionally accepts its occurrence `status`. Tenant and context filters
run before the list limits. Job searches use the saved plan name shown in history.

Prepared migration: `prisma/migrations/20261030150000_after_sales/migration.sql`.
Follow-up: `prisma/migrations/20261030170000_service_items/migration.sql` adds the
product flag and service charge catalog. Neither migration has been applied by this
implementation. Installation status is database-specific; verify installed tables before
setup. Where installation is still needed, install them in that order with separate
authorization. Product reads
tolerate an absent flag and older writes may omit it; selecting a service product or
using the charge catalog before installation returns a migration-required error.
Runtime code never creates tables or performs bootstrap
DDL. Source integrations probe for the installed tables and otherwise leave existing
sales behavior operational. Feature APIs return 503 with a migration-required message
until installation. Schema application needs separate explicit user authorization.
Deploy compatible Storetools and ecommerce API code around that
authorized installation. No customer portal, external reading ingestion, automatic
reading thresholds, paid AMC subscriptions or legacy Try N Buy integration is included.

Validation: `npm run test:after-sales` runs focused types, service tests and a browser
fixture against the real components, including charge catalog creation, mixed parts,
completion and zero invoice navigation. `tests/service-items.test.ts` exercises real
invoice/source writers with an in-memory SQL adapter, zero invoices, repeated requests,
stock movement, line validation and tenant rejection. `node --test
tests/catalog-purchase-drafts.test.mjs` checks shared product flag reads/drafts/staging.
The after-sales browser fixture imports the installed Nuxt UI components with isolated
Nuxt routing/config adapters and generated Tailwind styles; it checks list paging,
search/empty states, errors/recovery, amendment selection and side-panel interaction.
`tests/run-ui-browser.mjs` uses Chrome DevTools and real browser time for Headless UI's
animation-frame lifecycle. Fixture animations are disabled for deterministic assertions.
Optional `AFTER_SALES_PREVIEW` screenshots use sample data only; no database is required.
Ecommerce `tests/test_after_sales.py` runs real
Python lifecycle helpers with an in-memory SQL adapter. No new test creates or alters
a database schema. Feature integration against the installed PostgreSQL tables remains
a post-installation check via `npm run test:after-sales:db`, whose lifecycle test skips
without the prepared tables. Its lock-contention test uses a run-specific advisory
key and rolls back both connections. Existing order creation/cancellation regression harnesses
use rollback-only source transactions.

`tests/after-sales-api.integration.test.ts` exercises the actual after-sales handlers,
SQL, stock writes and installed deferred posting constraints. Its staff fixtures cover
company names, email fallback and inactive/deleted/cleanup exclusions. Workflow cases
cover configuration/catalog CRUD, links, sale context, registration, due/reminder
deduplication, staff assignment, cancellation/rebooking, completion allowances, claims,
readings, amendments, activation and returns. Paid and zero invoices include regular
and service parts, repeat issuance and free parts that still consume stock. Authentication
is supplied by the harness; this does not test browser login. Handler commits become
savepoints inside an outer rollback; no fixtures, invoices or stock changes persist.
`npm run test:after-sales:db` runs both database suites sequentially. Optionally set
`AFTER_SALES_TEST_COMPANY_ID` to select the API fixture's company. The normal browser
fixture also checks technician selection and claim complaint/resolution fields.

The API suite also checks every feature handler's role/company rejection, server
search and document filters, date-only serialization, terminal replacement rejection,
restart cancellation and carry-forward reading/audit visibility. Paid and free stock
parts both appear in client purchase history as separate source invoice purchases.

`npm run test:after-sales:e2e` runs the API suite plus a real Chromium browser workflow.
It mounts the actual configuration, service-item, workspace, client-history and
product-detail components and sends HTTP requests to actual handlers sharing the outer
PostgreSQL rollback transaction. Concurrent browser reads are serialized by the test
bridge to preserve savepoint nesting. The flow creates all three plan kinds and a
charge, searches/selects a client, registers a physical unit with all three plans,
refreshes due occurrences, searches/books a generated visit, checks required readings,
completes/defer-invoices a free visit, resolves/invoices
both coverage claim kinds, corrects a serial, records a reading and returns the unit.
It verifies the resulting UI and billing navigation. Nuxt routing/authentication and
the shared company navbar are supplied by the harness; browser login, the complete
Nuxt shell and downstream billing screens are not exercised by this workflow.

The browser fixture exercises completion confirmation on the actual product page:
failed saves do not prompt, Later leaves a saved job uninvoiced, open jobs do not prompt,
invoice failures remain retryable, repeated confirmation is locked during issuance,
and resolved claims show the same confirmation flow.

`npm run test:sales-after-sales` starts at real sale creation, rather than manual
customer-product registration. Its rollback-only installed-PostgreSQL matrix covers
all seven non-empty warranty/guarantee/maintenance combinations for cash and invoice
sales, additional UPI/card/credit/split tenders, serials on duplicate lines/variants,
activation anchors, quantity/client/product corrections, returns, replacements,
deletion/restoration, credit receipts/reversals, quote conversion, recurring issuance
and seller ecommerce delivery/cancellation. Real bill handlers, stock writes and
installed posting constraints run together; failed sales roll back their bill,
stock and registrations. Service invoices include stock parts and repeated issuance.
The connected Chromium journey uses the actual billing serial modal/composable,
creates a sale through HTTP, completes free maintenance and a paid claim invoice,
selects the exact returned unit, and edits the original invoice after the return.
It also carries the remaining unit's coverage to a replacement, selects its original
in the actual invoice removal control, and reduces the original sale quantity.
The sale/return buttons are test drivers, not the complete billing page; routing,
authentication and the navbar are supplied by the harness. `test:sales-after-sales:browser`
runs just that journey; `PRINT_TEST_WINDOW_SIZE=390,844` selects a mobile viewport.
Run database suites sequentially because they take real company transaction locks.
`AFTER_SALES_TEST_COMPANY_ID` pins this sales matrix to an active company with ERP
settings and staff; invalid selections fail instead of falling back to another company.
The selected-company run also sells/returns an existing covered in-stock product for
an existing linked client, preserving its saved coverage terms. Default runs still
require enabled ERP accounting. If the selected company's ERP integration is disabled,
`AFTER_SALES_TEST_ENABLE_ACCOUNTING=1` enables it only inside the outer rollback so
invoice scenarios can execute with its mapped accounts. A separate case restores the
saved disabled state and checks rejected invoice issuance and unposted credit
collection. Invoice UI preferences are also staged in the rollback fixture; this
does not verify that invoice controls are available under the company's saved settings.
Ecommerce `AFTER_SALES_DB_TESTS=1` with `pytest tests/test_after_sales_db.py` verifies
public cancellation of carried versus restarted replacements in rollback transactions.

`scripts/seed-after-sales-demo.ts` is a separate operational tool for explicitly
authorized persistent demo data. It requires an exact active company ID/name,
refuses existing `DEMO-AS` products or an existing output manifest, and backs up
settings plus fingerprints of original records before writes. Native Accountant
settings enable ERP with historical-source exclusions and save invoicing/after-sales
preferences in their own transaction; these settings remain saved if the subsequent
demo source batch fails. The source batch uses the production `pg` helpers and a
company lock, flushing deferred posting constraints at source-save boundaries before
collecting invoice receipts. It commits sample products, sales, coverage, jobs,
returns, replacement, receipts and a pending seller order; it performs no DDL or
external provider calls. Its zero-cost demo opening stock is separate from existing
inventory. The output manifest records commit status, IDs and backup paths.
`scripts/verify-after-sales-demo.ts <manifest>` verifies committed records through
fresh read-only queries and actual after-sales GET handlers, including client service
history, original-record fingerprints, stock and financial balances. Authentication
context is supplied locally for these handler checks; full app login is outside scope.

Customer history coverage includes the actual Client action builder with composite
table IDs, barcode search/pagination and product View navigation in the browser,
read-only queries against an existing unit, and API checks for registered/unregistered
purchase quantities, source invoice dates, labour exclusion and no automatic backfill.

The integration suite also reads an existing customer product in a `BEGIN READ ONLY`
transaction, checking detail collections, date-only reading values, newest-first order
and rejection of another company. Run just this check with `tsx --tsconfig
tests/tsconfig.after-sales.json --test --test-name-pattern="customer-product detail reads"
tests/after-sales.integration.test.ts`; it skips when tables or registered units are absent.

Product plan quick creation: `AfterSales/ProductSelector.vue` shows Create for an
unmatched search. `QuickCreatePlan.vue` opens a prefilled modal with a plan-kind
selector and the shared RulesEditor, saves through the existing company-scoped
configuration endpoint, and selects the new ID while preserving existing selections.
The create response contains ID/revision metadata; the selector combines it with the
submitted name/kind/rules for immediate display. Cancel performs no write; failed
saves keep the editor open. Company changes dismiss the editor and stale responses
cannot update the new company's selection. No schema changes are required.
