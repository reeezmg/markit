### Products (`/products`)

**Files:**
- `pages/products/index.vue` — Product listing, search, barcode scan, quick image upload
- `pages/products/add.vue` — Add new product with purchase order + distributor
- `pages/products/edit/[id].vue` — Edit existing product
- `pages/products/brands/index.vue` — Brand management table
- `pages/products/brands/add.vue` — Add brand; editing an existing brand uses `pages/products/brands/edit/[id].vue`
- `pages/products/categories/index.vue` — Category management table with PDF export
- `pages/products/categories/edit/[id].vue` — Category + subcategory full edit
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
- `server/api/products/save-batch.post.ts` — **Deferred batch save** (one transaction): all staged products + variants + items (batched multi-row), optional new PO (`po`) or link to existing (`poId`), PO-linked credit/payment; uses `INSERT ... RETURNING` for variants/items so trigger barcodes are returned without extra variant/item readback queries. O(1) round-trips regardless of product count
- `server/api/purchaseorder/save.post.ts` — Raw SQL atomic PO create (counter-1 numbering, link products, PO-linked credit/payment); replaces the `handleSaveWithPO` ZenStack chain
- `server/api/purchaseorder/update.post.ts` — Raw SQL atomic PO edit: the 6-branch credit/payment transition matrix (keyed by `purchase_order_id`) + PO row update; replaces `syncEditedPurchasePayment`
- `server/api/purchaseorder/[id].get.ts` — Raw SQL PO read (PO + products + variants + items), replaces `useFindUniquePurchaseOrder`
- `scripts/bench-product.mjs` / `bench-po.mjs` / `bench-save-batch.mjs` — rollback integrity+timing harnesses (BEGIN…ROLLBACK; nothing persists)
- `server/api/stock-aggregate.post.ts` — Stock aggregation by group
- `server/api/options/categories.ts` — Filter options: active categories
- `server/api/options/brands.ts` — Filter options: distinct brand names from active products
- `server/api/options/distributors.ts` — Filter options: distributors linked to company
- `server/api/options/ratings.ts` — Filter options: distinct ratings from active products
- `composables/useModelCache.ts` — `invalidateModels(...models)`: drops the ZenStack/TanStack query cache (`['zenstack', Model, ...]`) for a model. **Required after every raw-SQL write**, since those endpoints bypass the hook cache and the global 5-minute `staleTime` (`plugins/vue-query.ts`) otherwise leaves `/products` showing pre-write rows until a hard refresh. Called from `add.vue` (all `save-batch` / `products/update` / `purchaseorder/*` paths), `edit/[id].vue` (after `products/update`), and `AddProduct/Table.vue` (after `products/delete`)

**ZenStack hooks used:**
> **NOTE:** `pages/products/add.vue`, `pages/products/edit/[id].vue`, and `components/AddProduct/Table.vue` are **fully converted off ZenStack** to the raw-SQL endpoints listed above (no `~/lib/hooks`). The hook list below still applies to the *other* product pages (`index.vue`, `brands/`, `categories/`, `purchase.vue`).
> `useFindManyProduct`, `useFindUniqueProduct`, `useUpdateProduct`, `useUpdateManyProduct`, `useCountProduct`, `useDeleteProduct`, `useFindFirstItem`, `useCreatePurchaseOrder`, `useFindUniquePurchaseOrder`, `useUpdatePurchaseOrder`, `useUpsertVariant`, `useUpdateVariant`, `useDeleteManyVariant`, `useDeleteManyItem`, `useFindUniqueCategory`, `useFindManyCategory`, `useUpdateCategory`, `useUpdateManyCategory`, `useDeleteCategory`, `useCreateSubcategory`, `useUpdateSubcategory`, `useDeleteSubcategory`, `useFindManyBrand`, `useCreateBrand`, `useUpdateBrand`, `useUpdateManyBrand`, `useCountBrand`, `useDeleteBrand`, `useCreateDistributor`, `useFindManyDistributor`, `useCreateDistributorCredit`, `useUpdateManyDistributorCredit`, `useDeleteManyDistributorCredit`, `useCreateDistributorPayment`, `useUpdateManyDistributorPayment`, `useDeleteManyDistributorPayment`, `useUpdateDistributorCompany`

**Tables touched:** `products`, `variants`, `items`, `categories`, `subcategories`, `brands`, `purchase_orders`, `distributors`, `distributor_companies`, `distributor_credits`, `distributor_payments`, `save_error_requests`

---

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

**Deferred "stage then batch-save" model (current):** "Add Product" does **not** write to the DB. It uploads images to S3 (uuids only) and pushes a fully self-contained product object into `draft.stagedProducts` (an array on `useProductDraft`, persisted to `localStorage['product_drafts']`). The left `AddProduct/Table` renders the staged list directly (single source of truth → no fetch, no placeholder flicker). Edit/delete of a not-yet-saved product are pure local array ops. On **Save**, one call to `POST /api/products/save-batch` writes ALL staged products + variants + items in a single transaction (+ optional PO), and returns the created products with trigger-generated barcodes. Staged products are cleared **only after the transaction succeeds** (`clearCurrentDraftForNextProducts` → `draft.resetDraft()`); on failure they are kept for retry. This makes a multi-product save **O(1) round-trips** regardless of product count.

**Flow:**
1. `TopBar` collects distributor, bill no, bill date, payment type, discount, tax, adjustment, delivery type
2. `Create` collects product-level fields (name, brand, category, subcategory, description)
3. `Variants` collects variant fields (per variant: name, code, sprice, pprice, dprice, discount, qty, sizes)
4. `Media` uploads images to S3 on Add (uuids are stored in the staged product; files aren't localStorage-serializable)
5. Add Product → `handleAdd` stages the product locally (`buildStagedProduct`) and resets the form for the next entry — no DB write
6. Edit (`handleEdit`) replaces the staged entry in place; delete removes it from `draft.stagedProducts` — all local
7. Save dispatcher `handleSave` → `handleSaveNoPO` (no PO) / `handleSaveWithPO` (creates PO via `save-batch` `po`) / `handleSaveEditedPurchaseOrder` (PO-edit → `save-batch` with `poId`); barcodes come from the endpoint response. Reset only on success.
8. PO mode lives in `pages/products/purchase.vue` (`/products/purchase?poId=...`) and **still uses ZenStack** (`DistributorCredit`/`DistributorPayment`) — out of scope of the raw-SQL conversion

**TopBar payment logic:**
- `deliveryType` persisted to `localStorage` (key: `lastDeliveryType`) — restores last used on next open
- Can create new distributor inline without leaving the page (ZenStack `useCreateDistributor`)
- Discount: positive = percentage off, negative = flat deduction
- `oldPaymentType` vs `paymentType` pattern: tracks the original payment type to manage distributor credit/payment adjustments on edit

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
- **`add.vue` uses the raw-SQL API flow:** new staged products are committed through `/api/products/save-batch`; existing product edits use `/api/products/update`; PO edits use `/api/purchaseorder/update` and PO reads use `/api/purchaseorder/[id]`. It does not directly create each staged product through `/api/products/create`. `initial_qty` is seeded on item INSERT and preserved on update.
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
- Uses **Prisma** (not raw SQL)
- Fetches variants with items + product (category, subcategory, purchaseorder+distributor)
- Groups and sums: `stock` (sprice × qty), `purchaseStock` (pprice × qty), `qty`
- When `groupBy = "category"`: also builds a subcategory → variant breakdown (only used in console.log — **debug code left in production**)
- **Bug:** Debug `console.log` on lines 112–130 runs on every stocks page load, dumps full category/subcategory/variant breakdown to server logs

---

#### `components/AddProduct/Media.vue` — Image Upload
- Each variant has its own `Media` component instance (indexed by `props.index`)
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

Purchase-order product entry/edit page. The route can receive `poId` and an edit flag from distributor pages. Unlike `pages/products/add.vue`, this page still imports ZenStack hooks for products, purchase orders, distributor credits/payments and categories. The form ties product/variant/item work to PO payment and distributor context. Do not assume the deferred `save-batch` model of `/products/add` applies here.
