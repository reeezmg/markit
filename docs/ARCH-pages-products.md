### Products (`/products`)

Head-office admins default to the active head office plus active direct branches. Each table uses `useCompanyScope('table')` and `CompanyTableFilter.vue`; filters remain local to the component and participate in query keys. `CompanyFormField.vue` is inside add/edit forms: new forms default to the active head office, while edits load the stored owner through `/api/organization/context`. Related quick-add fields inherit their enclosing form company. Product, brand, category, collection, dimension, and stock tables use the local scope. Product and purchase-order forms resolve the saved owner before initializing settings. Product drafts use company-specific storage keys. Requests use explicit company IDs without updating the authentication session or sidebar company. `useOrganizationActions.ts` resolves row ownership locally. Changing an existing record's company opens the transfer preview, requires explicit destination mappings and linked-record confirmation, then moves the saved record in a transaction. Save other form changes before confirming a transfer. See `ARCH-storetools-api.md` for transfer and authorization details.

Company query composition uses `utils/companyWhere.ts` in both the generated-hook adapter and server authorization proxy. Existing `AND` clauses are appended as a flat array (never an array inside `AND`). The category list uses both statuses when its status filter is empty, avoiding `OR: []`. Product form category, collection, brand, and subcategory options react to the form company and remain scoped to that company.

Product/variant numbers (2026-10-29): the product list, product edit page and purchase draft table display `PROD-{productNo}` / `VAR-{variantNo}`. Product list search accepts these references or the numeric number alongside name/code/barcode search. Numbers are company-local, database-assigned identifiers separate from UUIDs and variant `code`; see `ARCH-schema.md` and migration `20261029120000_catalog_numbers`, which is installed on both authorized Neon databases.

Products with no `purchaseorderId` have **Add purchase order** and **Link to Purchase order** actions. Add opens `/products/add?from=distributor-purchase-order&productId=...&entryCompany=...`; Link opens `Products/LinkPurchaseOrderModal.vue`, searches the owning company's saved POs, and navigates to the same editor with `poId` and `isEdit=true`. Both stage the product without changing its saved link. `AddProduct/ExistingProducts.vue` is a compact searchable popover in `AddProduct/TopBar.vue`, immediately left of Delivery Type. Its input searches unassigned saved products by product name or company-local product number; the endpoint also retains variant name/code/number matching. The selected products render alongside new staged products and the PO's existing products; duplicates are excluded. New-PO selections persist in the company-specific product draft. Existing-PO additions use separate local state, so unrelated new-product drafts are not attached to the edited PO.

Selected saved products are read-only in the purchase draft. Removing them only removes the pending selection. Purchase quantities and totals use `initialQty` (falling back to `qty` for new unsaved items), preserving already-sold stock. New products added while editing a PO now stage until Save as well. `AddProduct/Table.vue` receives `localOnlyIds` to keep removal of selected/staged rows off the product-delete API. Save sends `existingProductIds` to `products/save-batch`; all selected links, new records and PO totals commit in one transaction. Missing/foreign-company products and products assigned to another PO reject the save; failed saves retain the local selections for retry. Existing settlements are not changed. Previously saved PO product edits/deletions retain their existing immediate API behavior.

**Files:**
- `pages/products/index.vue` — Product listing, search, barcode scan, quick image upload
- Product row expansion uses a writable ref for `v-model:expand`; the former plain constant threw when the table emitted an expansion update. The page compilation suite checks direct `v-model` assignments across all pages.
- `pages/products/add.vue` — Add new product with purchase order + distributor
- `pages/products/edit/[id].vue` — Edit existing product
- `pages/products/brands/index.vue` — Brand management table
- `pages/products/brands/add.vue` — Add brand; editing an existing brand uses `pages/products/brands/edit/[id].vue`
- `pages/products/categories/index.vue` — Category management table with PDF export
- `pages/products/categories/edit/[id].vue` — Category + subcategory full edit
- Category create/edit reject whitespace-only names before mutation. Create preserves the emitted inactive state and explicit zero tax/margin values. The catalog browser harness includes category create, row-action edit, reload and confirmed delete in each company; its fixture guard permits only run-owned categories with no nested child writes.
- `pages/products/stocks/index.vue` — Stock aggregate view (groupBy + filters)
- `components/AddProduct/Create.vue` — Product fields form (name, brand, category, subcategory, description)
- `components/AddProduct/Variants.vue` — Variant fields form (name, code, unit, sprice, pprice, dprice, discount, qty, sizes)
- `components/AddProduct/Media.vue` — Image upload per variant with AI enhancement
- `components/AddProduct/Live.vue` — "Get it live" toggle (product status), default ON
- `components/AddProduct/TopBar.vue` — Purchase info modal (distributor, bill, payment, discount, tax, adjustment)
- `components/AddProduct/Table.vue` — PO product table used in add/edit page
- `components/AddProduct/linkList.vue` — Anchor quick-links sidebar for add page
- `server/api/products/create.post.ts` — Raw SQL product creation with retry (batched multi-row variant/item inserts; writes `brand_id` — earlier `brand` column bug fixed)
- `server/api/products/[id].get.ts` — Raw SQL product read (product+brand+category+subcategory+variants+items), replaces `useFindUniqueProduct` on the edit page
- `server/api/products/update.post.ts` — Raw SQL product update: COALESCE product fields, prune removed variants/items, batched multi-row variant + item upserts (ON CONFLICT), server-side tax recalc, and returns the updated product shape via `RETURNING` rows so the edit page can avoid an immediate refetch. The item INSERT supplies all declared columns, including the `variant_id` placeholder (fixed after the omitted value caused every item-bearing update to roll back). Replaces nested `useUpdateProduct`
- `server/api/products/category-tax.get.ts` — Raw SQL category tax fields (`?id=`), replaces `useFindUniqueCategory` for tax recalc
- `server/api/products/by-ids.post.ts` — Raw SQL product list by id array (with brand/category/subcategory + variants + items incl. `initialQty`), replaces `useFindManyProduct` for the draft table
- `server/api/products/delete.post.ts` — Raw SQL product delete (`{ id }`, company-scoped; variants/items cascade), replaces `useDeleteProduct`
- The Products list (`pages/products/index.vue`) also uses this delete endpoint so removing a purchased product recalculates its PO and linked accounting. It sends the row's company, lets the server clean up media, and invalidates product/stock/purchase query caches.
- `server/api/products/save-batch.post.ts` — **Deferred batch save** (one transaction): all staged products + variants + items (batched multi-row), optional new PO (`po`) or link to existing (`poId`), PO header purchase source and optional numbered payment; Credit POs create no DC; uses `INSERT ... RETURNING` for variants/items so trigger barcodes are returned without extra variant/item readback queries. O(1) round-trips regardless of product count
- `server/api/purchaseorder/save.post.ts` — Raw SQL atomic PO create (counter-1 numbering, link products, PO header purchase source and optional numbered payment; Credit POs create no DC); replaces the `handleSaveWithPO` ZenStack chain
- `server/api/purchaseorder/update.post.ts` — Raw SQL atomic PO edit: PO-header source updates that preserve recorded payments and standalone credits; replaces `syncEditedPurchasePayment`
- `server/api/purchaseorder/[id].get.ts` — Raw SQL PO read (PO + products + variants + items), replaces `useFindUniquePurchaseOrder`
- `scripts/bench-product.mjs` / `bench-po.mjs` / `bench-save-batch.mjs` — rollback integrity+timing harnesses (BEGIN…ROLLBACK; nothing persists)
- `npm run test:product-stock` executes the actual product-handler item-upsert SQL against PostgreSQL in a rollback-only fixture. Covers purchase edits after sales, stale metadata saves, initial-only quantity changes and attempts to overwrite current/sold counters, overselling and supplier returns; it changes no schemas.
- `npm run test:products-distributor-accounting:api` exercises real product/PO, return, distributor payment/receipt and billing handlers against installed accounting triggers. Assertions cover account movements and physical quantities; commits become savepoints and the entire run rolls back. PO model-delete cascading is checked directly in SQL; browser login/clicks are outside this harness.
- `server/api/stock-aggregate.post.ts` — Stock aggregation by group
- `server/api/options/categories.ts` — Filter options: active categories
- `server/api/options/brands.ts` — Filter options: distinct brand names from active products
- `server/api/options/distributors.ts` — Filter options: distributors linked to company
- `server/api/options/ratings.ts` — Filter options: distinct ratings from active products
- `composables/useModelCache.ts` — `invalidateModels(...models)`: invalidates ZenStack/TanStack query keys (`['zenstack', Model, ...]`) after raw-SQL writes, which bypass hook cache updates and the global 5-minute `staleTime` (`plugins/vue-query.ts`). PurchaseOrder, DistributorPayment, DistributorCredit and PurchaseReturn writes also invalidate the embedded DistributorCompany query; payment writes invalidate PurchaseOrder dues. Called from product add/edit, purchase and distributor payment flows so tables show updated source totals without a browser reload.

**ZenStack hooks used:**
> **NOTE:** `pages/products/add.vue`, `pages/products/edit/[id].vue`, and `components/AddProduct/Table.vue` are **fully converted off ZenStack** to the raw-SQL endpoints listed above (no `~/lib/hooks`). The hook list below still applies to the *other* product pages (`index.vue`, `brands/`, `categories/`, `purchase.vue` for reads/new-product creation).
> `useFindManyProduct`, `useFindUniqueProduct`, `useUpdateProduct`, `useUpdateManyProduct`, `useCountProduct`, `useDeleteProduct`, `useFindFirstItem`, `useCreatePurchaseOrder`, `useFindUniquePurchaseOrder`, `useUpdatePurchaseOrder`, `useUpsertVariant`, `useUpdateVariant`, `useDeleteManyVariant`, `useDeleteManyItem`, `useFindUniqueCategory`, `useFindManyCategory`, `useUpdateCategory`, `useUpdateManyCategory`, `useDeleteCategory`, `useCreateSubcategory`, `useUpdateSubcategory`, `useDeleteSubcategory`, `useFindManyBrand`, `useCreateBrand`, `useUpdateBrand`, `useUpdateManyBrand`, `useCountBrand`, `useDeleteBrand`, `useCreateDistributor`, `useFindManyDistributor`, `useCreateDistributorCredit`, `useUpdateManyDistributorCredit`, `useDeleteManyDistributorCredit`, `useCreateDistributorPayment`, `useUpdateManyDistributorPayment`, `useDeleteManyDistributorPayment`, `useUpdateDistributorCompany`

**Tables touched:** `products`, `variants`, `items`, `categories`, `subcategories`, `brands`, `purchase_orders`, `distributors`, `distributor_companies`, `distributor_credits`, `distributor_payments`, `save_error_requests`

---

#### Stock quantity invariant

Available quantity is `initial_qty - sold_qty - supplier returns`. Generated item creates (including nested and bulk creates) seed initial quantity from the submitted initial/current quantity and start sold quantity at zero. Generated updates cannot change any of these three counters; initial-quantity edits must use the product API so saved sales and returns are preserved. The legacy `POST /api/item` creates stock only for company-owned variants without existing items, in a serializable transaction. It refuses to replace existing items, barcodes or sales history.

Product upserts lock existing item rows before the statement that sums supplier returns, so a concurrent committed return is visible. Offline returns, ecommerce cancellation and received ecommerce returns move available and sold counters equally in opposite directions; sold quantity may become negative for net returns and is never clamped independently.

`scripts/reconcile-company-stock-rows.mjs` requires explicit company ID/name/report prefix. Default execution is read-only. Authorized `--apply` backs up item rows and stock control, fingerprints existing accounting/source history, updates only available quantities, and invokes the installed stock-control reconciliation. It verifies all initial/sold values and source documents are unchanged, all quantities and Stock accounts tally, existing journals remain intact, and a repeat reconciliation posts nothing. It never changes database schemas.

#### Product PurchaseOrder Link
The current `/products/add` flow stages products in `localStorage['product_drafts']` and writes them through `/api/products/save-batch` only when Save succeeds. That transaction can include a new PO or link an existing PO; products do not have to be attached to a PO. PO edit/new-from-distributor flows use `/products/purchase?poId=...`.

---

#### `POST /api/products/create` — Product Creation (Raw SQL)
Product creation does NOT use ZenStack or Prisma — it uses raw SQL (`pg` pool) for atomicity and retry reliability.

**Flow:**
1. INSERT into `products` table
2. INSERT all `variants` in the same transaction
3. INSERT all `items` for each variant
4. Tax calculated per variant from category `taxType`:
   - `FIXED` → use `category.fixedTax`
   - `VARIABLE` → use `taxBelowThreshold` or `taxAboveThreshold` based on `sprice` vs `thresholdAmount`
5. Images sorted with `'front'` view first before insert

**Retry logic:** 3 attempts with exponential backoff (200ms → 400ms) on transient error codes:
`40001, 40P01, 53300, 57P01, 55006, 08006, 08003, P1001`

**On failure:** Logs to `save_error_requests` table with `companyId`, `requestData` (JSON), `errorMessage`

---

#### `pages/products/index.vue` — Product List
- Paginated product list with search (name/code/brand), category filter, status filter, rating filter
- Uses Quagga2 barcode scanner — scans barcode on camera, looks up item via `useFindFirstItem`
- Image carousel via Swiper
- Quick image upload: upload photo directly from list → updates product images via `AwsService`
- **Bulk actions:** delete many, deactivate many via `useUpdateManyProduct`
- Purchase order section: inline PO creation from product list view (for restocking)

---

#### `pages/products/add.vue` — Add Product
Multi-section form with purchase info at top.

**Sub-components used:** `AddProduct/TopBar`, `AddProduct/Create`, `AddProduct/Variants`, `AddProduct/Media`, `AddProduct/Live`, `AddProduct/linkList`, `AddProduct/Table`

**Deferred "stage then batch-save" model (current):** "Add Product" does **not** write to the DB. It uploads images to S3 (uuids only) and stages a fully self-contained product object. New-product drafts persist `stagedProducts` and `existingProducts` through `useProductDraft` in `localStorage['product_drafts:' + companyId]`; existing-PO additions have separate local state. The left `AddProduct/Table` renders this list directly. Edit/delete of a not-yet-saved product are local array operations. On **Save**, one call to `POST /api/products/save-batch` writes staged products + variants + items and selected existing-product links in a single transaction (+ optional new PO), and returns created products with trigger-generated barcodes. Staged products and selections are cleared only after success; failures keep them for retry. The save uses a constant number of SQL round trips regardless of product count.

**Flow:**
1. `TopBar` collects distributor, bill no, bill date, payment type, discount, tax, adjustment, delivery type
2. `Create` collects product-level fields (name, brand, category, subcategory, description)
3. `Variants` collects variant fields (per variant: name, code, sprice, pprice, dprice, discount, qty, sizes)
4. `Media` uploads images to S3 on Add (uuids are stored in the staged product; files aren't localStorage-serializable)
5. Add Product → `handleAdd` stages the product locally (`buildStagedProduct`) and resets the form for the next entry — no DB write
6. Edit (`handleEdit`) replaces the staged entry in place; delete removes it from `draft.stagedProducts` — all local
7. Save dispatcher `handleSave` → `handleSaveNoPO` (no PO) / `handleSaveWithPO` (creates PO via `save-batch` `po`) / `handleSaveEditedPurchaseOrder` (PO-edit → `save-batch` with `poId`); barcodes come from the endpoint response. Reset only on success.
8. The current create/edit PO entry page is `/products/add` with `from=distributor-purchase-order` and optional `poId`/`isEdit`. The legacy `/products/purchase?poId=...` page remains a separate flow; its purchase/payment save uses `/api/purchaseorder/update` and existing-product editing uses `/api/products/update`.

**TopBar payment logic:**
- `deliveryType` persisted to `localStorage` (key: `lastDeliveryType`) — restores last used on next open
- Can create new distributor inline without leaving the page (ZenStack `useCreateDistributor`)
- Discount: positive = percentage off, negative = flat deduction
- `oldPaymentType` vs `paymentType` pattern: tracks the original payment type to reject unsafe changes with recorded payments; PO edits preserve payment amounts

**Variant pricing logic (`Variants.vue`):**
- `dprice` auto-defaults to `sprice` when first set (if user hasn't manually changed it)
- Editing `dprice` → auto-calculates `discount%` = `(sprice - dprice) / sprice * 100`
- Editing `discount%` → auto-calculates `dprice` = `sprice * (1 - discount/100)`
- `unit` defaults to `Nos` and is persisted on the parent `Variant` row
- `qty` auto-calculated from sum of all item quantities when sizes are present

**Item/Sizes logic:**
- No sizes → single item with `size = null`, qty = variant qty
- With sizes → multiple items with distinct size labels and individual quantities
- Total qty = sum of all item qtys

---

#### `pages/products/edit/[id].vue` — Edit Product
- **Converted off ZenStack to raw-SQL endpoints** (no `~/lib/hooks`): reads via `GET /api/products/[id]`, tax recalc via `GET /api/products/category-tax`, save via `POST /api/products/update`.
- **`add.vue` uses the raw-SQL API flow:** new staged products are committed through `/api/products/save-batch`; existing product edits use `/api/products/update`; PO edits use `/api/purchaseorder/update` and PO reads use `/api/purchaseorder/[id]`. It does not directly create each staged product through `/api/products/create`. `initial_qty` is seeded on item INSERT. Product and purchase edit inputs are labelled "Initial quantity" and load `item.initialQty`, never current stock. Existing item edits change only initial quantity (`updateInitialQty: true` on the item, or the legacy request-level purchase flag). All edit screens send the item flag only when the initial-quantity input differs from its loaded value, so an unchanged save preserves the latest stored initial quantity. Current `qty = initial_qty - sold_qty - supplier-return quantity` is derived using the latest stored counters; incoming current/sold counters and `updateStockQty` cannot overwrite them. Supplier-return quantity is summed from company-scoped `purchase_return_items`/`purchase_returns`. Normal product metadata saves leave initial quantity unchanged; changing its initial-quantity input sends the explicit item flag. Product and purchase edits recalculate PO totals. Negative remaining stock is retained for oversold items.
- Save sends the variant/item buffer to `/api/products/update`, which prunes removed variants/items and upserts the rest in one transaction
- The edit form renders `AddProductVariants` from that same save buffer. Its per-variant size-label picker uses the company-configured options (for example `Size`, `Shade`, or another label), and edits persist to `variants.size_label` through `/api/products/update`.
- `deleteMany` semantics preserved server-side (variants/items not in the current list are deleted)
- Barcode print modal: per-item qty input before printing barcodes
  - Single item (no size): one barcode input
  - Multiple items (sizes): per-size qty inputs
- Validation: category required; `dprice` cannot exceed `sprice`
- Tax details on category change come from `GET /api/products/category-tax`.

---

#### `pages/products/brands/`
- `index.vue`: Expandable rows showing brand → categories → product counts + total qty
  - Brand qty = sum of all item.qty across all variants/products of that brand (client-side calculation)
  - Bulk deactivate via `useUpdateManyBrand`
- `add.vue`: Dedicated brand creation page with name, target audience, description, status and image upload (`useCreateBrand`). Delete is an action on the brand list via `useDeleteBrand`.

---

#### `pages/products/categories/`
- `index.vue`: Expandable rows → subcategories with product counts and qty
  - Delete guarded: cannot delete category if it has products (`products.length > 0` check)
  - PDF download: `GET /api/category/stock-by-category.pdf`
- `edit/[id].vue`: Full category edit — name, HSN, shortCut, taxType, fixedTax, thresholdAmount, taxBelowThreshold, taxAboveThreshold, margin, targetAudience
  - Subcategories managed inline (add/edit/delete in same page)
  - Refreshes `categoryStore` after save

---

#### `pages/products/stocks/index.vue` — Stock Aggregate
- Calls `POST /api/stock-aggregate` (NOT ZenStack — custom route)
- Filter options fetched from `/api/options/categories`, `/api/options/brands`, `/api/options/ratings`, `/api/options/distributors`
- GroupBy options: `product`, `date`, `category`, `brand`, `rating`, `distributor`
- Shows totals: Total Qty, Stock in MRP (`qty * sprice`), Total Stock Value (`qty * pprice`)

#### `POST /api/stock-aggregate`

Stock aggregation reads current scoped variant items. Brand options expose Brand IDs and names; the stock reader filters `Product.brandId` and groups by related Brand name. Supplier and date restrictions share one purchase-order filter. Group dictionaries have no prototype. Stock option lists default to arrays while requests load; the POST stock endpoint performs reads only.
- Uses **Prisma** (not raw SQL)
- Fetches variants with items + product (category, subcategory, purchaseorder+distributor)
- Groups and sums: `stock` (sprice × qty), `purchaseStock` (pprice × qty), `qty`

---

#### `components/AddProduct/Media.vue` — Image Upload
- Each variant has its own `Media` component instance (indexed by `props.index`). Unchanged empty image props preserve the existing arrays; product edit also ignores identical media emissions, preventing a parent/child update loop for products without images.
- Image views: `front`, `back`, `side`, `extra` — user can change via dropdown
- File input uses `accept="image/*"` without a `capture` attribute, allowing the mobile system chooser to offer Camera, Photos, or Files.
- Images stored on AWS S3 — accessed via `https://images.markit.co.in/{uuid}`
- Cache-busting: appends `?t={product.updatedAt}` to existing images
- AI enhancement button shown if `session.isAiImage = true` AND image is already uploaded (not a new file)
  - Calls `AwsService.aify(uuid, view, categoryName, targetAudience)`
  - After AI: calls `useUpdateProduct` with `updatedAt: new Date()` to bust cache, then emits `refetch`

---


### Distributor (`/distributor`)

> **Moved to dedicated file:** See `ARCH-pages-distributor.md` for full distributor documentation (index, credit, purchase orders, form).

---


### `pages/products/categories/add.vue` — Add Category
**Data:** `useCreateCategory` — creates a new category for the current company

**Fields:** name, shortCut (keyboard shortcut), HSN code, description, margin %, targetAudience, optional image (uploaded to AWS S3 via `AwsService`)

Uses `useCategoryStore` for local cache update after creation.

**Note:** `products/categories/edit/[id].vue` is the full edit page (documented under the Products section) — handles name, HSN, taxType, fixedTax, threshold amounts, margin, targetAudience, subcategories.

---

### `pages/products/edit/[id].vue` — Edit Product
The edit page loads the product from `GET /api/products/{id}`, looks up category tax through `/api/products/category-tax`, and saves through `POST /api/products/update`. It pre-fills product and variant fields, supports media editing and barcode-label printing, and observes configured variant inputs. This is a raw-SQL API flow, not the old `useFindUniqueProduct`/`useUpdateProduct` ZenStack flow.

---


---
## Additional current catalog pages

### `pages/products/collections/index.vue`

Collection list for organizing storefront products into named groups. Uses company-scoped collection hooks to load a searchable, status-filtered, paginated table. Staff can open add/edit, toggle status, and delete a collection. A collection is a catalog grouping, not a product stock record.

### `pages/products/collections/add.vue`

Create a company collection with name and optional descriptive/display information through `useCreateCollection`. It validates the name before saving and returns to the collection flow on success.

### `pages/products/collections/edit/[id].vue`

Loads one collection by route ID with `useFindUniqueCollection` and saves edits through `useUpdateCollection`. This is separate from editing products that belong to the collection.

### `pages/products/dimensions/index.vue`

Maintains reusable product/package dimension records. Lists records from `/api/dimensions`, creates them with `POST`, and updates/deletes a selected record with the ID route. This is the dimension library, not the per-product editor.

### `pages/products/brands/edit/[id].vue`

Loads the brand by ID with `useFindUniqueBrand`; saves name, target audience, description and live status through `useUpdateBrand`. This is distinct from the add-brand route.

### `pages/products/purchase.vue`

Purchase-order product entry/edit page. The route can receive `poId` and an edit flag from distributor pages. New-product creation still uses hooks. Editing an existing product uses `/api/products/update` with item-level `updateInitialQty: true` only for changed initial quantities and request-level `syncPurchaseOrder: true`, so purchased quantities are saved separately from remaining stock and the PO totals are recalculated. Saving the purchase header and payment uses `/api/purchaseorder/update` in one transaction. PO edits and product-driven total recalculation synchronize existing same-supplier purchase journals through `purchase-accounting-update.ts` before commit. The journal ID/entry number remains stable; its current amounts/lines follow the source and previous values are stored in audit JSON. Save-batch applies this again after transaction account overrides. No schema or trigger changes are required. Do not assume the deferred `save-batch` model of `/products/add` applies here.

The purchase information `TopBar` includes `DistributorAccountSelection` for connected
distributors. It emits `accountingAccounts` with payable/stock/tax/cash/bank choices.
Both add and purchase pages send those choices to their save endpoint; the server's
`selectDistributorAccounts` validates company and account type and saves the source
snapshot inside the same transaction. Existing same-supplier purchase edits update
the linked journal in place before commit; deferred triggers handle first postings
and other source transitions. See `ARCH-pages-distributor.md` for import and reconciliation.

### Related variables on product labels

Product add, purchase and edit label payloads carry the saved item ID and the form company ID. `utils/load-label-variables.client.ts` batches distinct identities by company before custom preview/printing, reuses each result for quantity copies, and rejects missing/ambiguous items. Canvas preview, WebUSB and native Bluetooth printing share this enrichment. Product add, edit and purchase actions call `usePrint().printLabel`, which resolves the company default design and its paper dimensions at print time. The USB device (web), selected Bluetooth printer (native) and TSPL/CPCL language are configured in Settings > Printer; no print action opens a device chooser or browser print dialog. CPCL has no fixed-command fallback. Related fields require an online lookup unless the supplied label data is already enriched; legacy flat-field labels keep their existing offline behavior. Company, product relations and supplier values come from the authorized label-variable API, not a global session company or arbitrary table traversal.

Product-list Date cells use the explicit en-IN locale and Asia/Kolkata timezone. Ambient Node/browser locale settings must not change the hydrated cell text.

Product-label barcode resolution accepts both flat `barcode` and enriched `item.barcode`. If a configured item-barcode element has no value but a saved item ID exists, label-variable loading looks up the barcode within that company, even for a flat-only design. Missing barcode values reject the job before transmission instead of silently omitting the symbol. Barcode errors do not trigger the native TSPL fallback. Legacy TSPL labels measure CODE128 modules and reduce bar width to fit a 50 mm label with quiet zones, rather than always using three-dot bars.
