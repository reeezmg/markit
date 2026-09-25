## Public / Marketing Pages

### Storefront Agent Stale-Slot Reconciliation

Before the per-user processing guard blocks a new allocation, `orchestrator/server.js` `claimAffinitySlot()` checks that user's existing `running` row with one `/api/turn` request. It releases PostgreSQL ownership only when the sandbox explicitly reports `idle` with no turn ID, marks the interrupted conversation terminal, and continues normal FIFO allocation. It never probes `dispatching` rows; unreachable or ambiguous sandboxes remain owned for the hard-timeout path. This recovery uses no cron, periodic heartbeat, or background polling. This rule supersedes the older statement below that allocation does not probe Cloud Run instances.

### One Active Editor per Storefront

The database also has a partial unique index that prevents more than one non-null `owner_company_id` from being `processing`, independently of application-level allocation logic.

`claimAffinitySlot()` serializes its check-and-claim transaction with a PostgreSQL advisory transaction lock keyed by `company_id`. `edit_environment.owner_company_id` records the active storefront owner, and any second staff user's request for that company remains in the company-scoped FIFO queue while a slot is `processing`; unrelated companies do not block each other's queue order. After the active task commits and pushes `preview`, the next queued request can claim a slot. Fresh hydration clones remote `preview`; warm same-conversation reuse calls sandbox `/api/sync-preview`, which fetches and hard-aligns the idle workspace to `origin/preview` while retaining the Pi conversation context. This prevents two containers from concurrently pushing the same storefront and prevents a warm container from resuming stale repository files.

### Storefront Agent Final Reply

### Codex-Style Active Queue Composer

While a task runs, Enter and the primary composer action add durable FIFO items to `storefront_agent_sessions.queued_messages`. Entries have stable IDs, text, and optional company/conversation-scoped R2 image metadata. The queue supports atomic drag reorder, delete, and per-item steer through the existing Pi `session.steer()` path. Edit temporarily removes an item into the unified composer while preserving its ID and neighboring item IDs; save reinserts it beside a surviving neighbor even if earlier items ran or the queue was reordered meanwhile. The unified bordered composer contains image previews, a borderless textarea, image button, blue soft Plan control, collapsed selected-model label, and the right-aligned send/queue action. When a queued image item runs, Storetools retrieves its durable R2 bytes and passes them through the normal sandbox image flow without storing base64 in PostgreSQL.

During a Pi run, sandbox `message_update` events update the internal `writing` stage but their text deltas are not streamed or concatenated into the seller reply. Tool execution remains visible through structured activity events. When the run becomes idle, the sandbox extracts text only from the final assistant message in `active.session.messages`; that single final summary becomes `turn.text`, the persisted PostgreSQL reply, and the message rendered by `ChatSlideover.vue`.

### `pages/index.vue` — Unified AI commerce landing page

Public, server-rendered marketing page using `layouts/brand.vue`, forced light colour mode and `auth: false`. It replaces the former consumer and seller landing pages. It does not perform its former page-level logged-in redirect; existing global auth/session restoration still applies.

- The shared warm-studio design system lives in `assets/css/brand.css`; navigation, mobile menu and footer live in `layouts/brand.vue`. Orange is the action/accent colour, cream the canvas, apricot the supporting surface, and warm charcoal the contrasting ERP panel. Cards use the shared 16px outer radius and 8px control radius. Extend these tokens and shared card rules rather than introducing unrelated section palettes; product photography can retain its own colours. The journal uses the same palette.
- The hero, metadata, navigation and FAQ introduce **A-commerce (agentic commerce)**. `#acommerce` explains direction → AI storefront development → merchant review/publishing. The [Amboras explanation](https://www.amboras.com/what-is-agentic-ecommerce) informed the category definition; the page describes Markit's own preview/publish workflow and does not promise unattended optimisation or autonomous commerce operations.
- `assets/css/brand-motion.css` provides finite hero/underline/floating-card entrances and hover feedback. The page's IntersectionObserver adds one-time Web Animations API reveals to off-screen section headings/cards without hiding server-rendered content. Reduced-motion preferences disable CSS motion and are checked before every reveal; a live preference change cancels active reveals. Unmount disconnects the observer, cancels animations and removes the preference listener. Pricing and demo changes remain user-triggered.
- Sections cover AI storefront development, an explicitly labelled interactive demonstration, content/image/SEO assistance, custom plugin and agent development ideas, existing retail ERP workflows, pricing and visible questions/answers. The journal section and all blog links are omitted from the landing page and shared header/mobile/footer navigation; articles remain accessible at their public URLs.
- `components/Marketing/StorefrontDemo.vue` offers four local design prompts (accessories, skincare, streetwear, coffee), each with its own generated WebP storefront screenshot in `public/images/marketing/demo-*.webp`. `assets/css/storefront-demo.css` styles the responsive preview and animated simulated terminal. Clicking runs three stages over 2.1 seconds before revealing the loaded image; reduced-motion users skip the delay. New clicks cancel previous timers and image callbacks; failed loads expose a retry and pending work is cleared on unmount. The UI labels the sequence as a simulation: it does not invoke a model or edit a real store. ERP graphics are also explicitly illustrative.
- `data/marketing.ts` owns the visible FAQ and four screenshot-specified marketing plans: Basic, Pro, Advanced and Plus. Monthly prices are INR 4,695 / 10.06K / 38.23K / 239.5K; yearly monthly equivalents are INR 3,737 / 9,103 / 34.5K / 239.5K. Yearly totals derive from these displayed rates. Savings vary by plan.
- Start-for-free links go to `/register` without passing the new plan names. Registration still supports the existing free/lite/pro values; the marketing change does not provision paid entitlements or implement subscription billing. Plus uses the existing public contact email.
- Custom plugins and agents are described as development projects requiring their own integrations, permissions and testing, not as preinstalled features.
- Generated imagery is local under `public/images/marketing/`; the page uses the compressed WebP. The asset README records the original prompt and tool.
- Home metadata includes canonical, Open Graph/Twitter image, Organization/WebSite and FAQPage JSON-LD. FAQ answers are rendered visibly from the same data. Search placement is not guaranteed; Google retired FAQ rich results in May 2026.

### `pages/landing.vue` and `pages/storelanding.vue` — Legacy redirects

Both routes permanently redirect to `/`. `nuxt.config.ts` defines Nitro 301 rules and each page provides a `navigateTo` fallback for client navigation. There is only one active landing-page implementation.

### `/blogs` — The Commerce Edit

`pages/blogs.vue` is the brand-layout parent. `pages/blogs/index.vue` lists ten original articles from `data/commerce-articles.ts`; `pages/blogs/[slug].vue` renders their full server-rendered content, table of contents, related links and signup CTA. Unknown slugs throw 404. Article metadata uses canonical URLs, BlogPosting and BreadcrumbList JSON-LD, with no invented reviews or publication dates. The existing static Try N Buy article remains available at its original URL.

The sitemap configuration includes only home, public blogs and terms; dynamic article URLs are supplied explicitly from the article data. The library covers storefront creation, A-commerce, SEO, custom plugins/agents, retail ERP, AI briefs, imagery, product pages, bundles and shopping assistants. Articles retain visible content, canonical metadata, related links and sitemap discovery even though they are not promoted on the landing page. These are reviewed static articles included in source, not a recurring unattended publishing service. Add an article to the data module to include it in the journal and sitemap. No new database, AI API call or scheduler is needed to render these pages.

---
### `pages/launching.vue` — "Launching Soon" Placeholder
Consumer-facing coming soon page. Uses `layout: false`.

**Content:** `ULandingHero` with "Launching soon. The way you shop locally is about to change." + logo + `/images/hero.png`

**Navbar buttons:** "List Your Shop" → `/getting-started`, "Login" → `/getting-started`, "Register" → `/getting-started` (all redirect to same placeholder)

---

### `pages/marketplace.vue` — Internal Seller Marketplace
**Purpose:** Allows logged-in users to browse and discover seller companies on the platform.

**Data:** `useFindManyCompany` — filtered by `type: 'seller'` + `status: true` + name search

**Components:** `CompanyCard` rendered in a responsive grid (1/2/3/4 cols)

**Bugs:** `console.log(companies)` at module scope — logs all companies on mount

---

### `pages/nonetwork.vue` — Offline Error Page
**Purpose:** Shown when the Capacitor app detects network loss; stored previous route in `localStorage['prevRoute']`.

**Retry logic:**
- "Retry" button → checks `navigator.onLine` → if online, reads `localStorage['prevRoute']` and navigates back
- `window.addEventListener('online', ...)` in `onMounted` — auto-retries when connectivity restores
- Listener cleaned up in `onBeforeUnmount`

---

### `pages/terms.vue` — Terms of Service & Privacy Policy
Static legal page with 30 sections. Uses `useSeoMeta`. No script logic beyond meta setup.

**Content sections:** Agreement, Eligibility, Platform Overview, User Accounts, Try-at-Home Service (highlighted), Booking & Orders, Payments, Cancellation & Refunds, Delivery, User Responsibilities, Seller Terms, IP, Liability, Indemnification, Suspension, Governing Law (Karnataka, India), Dispute Resolution, Changes, Privacy Policy (embedded), Data Collection/Use/Sharing/Cookies/Retention/Security/Rights/Third-Party/Children's/Updates, Contact (reez@markit.co.in, Mangaluru)

---

### `pages/blogs/what_is_try_n_buy.vue` — Blog: Try N Buy Explainer
Static marketing blog article. No script logic beyond `useSeoMeta`.

**Sections:**
- How it Works (4-step): Browse → Pay delivery → Try at home → Keep or return
- Why Customers Love It (bullet list)
- Why Stores Choose Markit (bullet list)
- Testimonial quote
- CTA: `BlogCTAStoreCTA` component

---

### `pages/marketing/index.vue` — Empty Stub
`<template></template>` — completely empty.

---

## Store Frontend (Customer-Facing E-Commerce)

The `pages/store/[[company]]/` sections below are **historical**: those Vue files are not present in the current Storetools page tree. Do not treat them as live Nuxt routes. The current custom storefront is described in the `revomotive/client` and `ecommerce-api` section below, and its seller editor is documented in `ARCH-pages-ai-editor.md`.

### Custom storefront (`revomotive/client`) + `ecommerce-api`
The Revomotive custom storefront is a Vite/Vue SPA at `revomotive/client` backed by the FastAPI custom API under `ecommerce-api/api/app`.

- `storetools/pages/storefront/editor.vue` gates the editor behind storefront source provisioning. A company without a ready source sees only generic Create storefront / building / retry states; repository provider, owner, name, visibility, branch, project, and deployment details are never exposed in this UI. The page polls source status while the initial builds run and loads the stable Vercel `preview` branch alias in the editor iframe only after both initial deployments and their aliases are ready.
- The source provisioning backend derives the repository name exclusively from `companies.store_unique_name`, generates or reuses a private repository from the configured `Markit-Store/storefront-starter` template, and includes both template branches. It then creates or reuses a Vite Vercel project, connects the private GitHub repository, and starts `main` as a production deployment plus `preview` as a preview deployment. Vercel and GitHub controls remain server-only.
- **Editor Save/publish:** The storefront editor Save button is always available. It first persists dirty legacy page configuration, then calls authenticated `POST /api/ecommerce-cms/storefront-source/publish`. Storetools obtains a short-lived GitHub App installation token, compares `main...preview`, and updates `refs/heads/main` to the exact preview SHA only when preview is ahead. Equal SHAs return a non-error “already up to date” result; divergent histories return 409 without moving main. The main push retains the preview commit author and triggers the connected Vercel production deployment; the route records the newest main deployment when it is already visible, while the webhook remains the eventual update path.
- Generated Vercel storefront projects set `ssoProtection` to `null`; Vercel Authentication otherwise redirects the stable preview alias to an SSO page with `X-Frame-Options: DENY`, which cannot render inside the Storetools iframe. The editor's initial storefront-status request reapplies this idempotent project setting so older/already-ready storefronts are repaired too, while active build polling does not repeat the Vercel project PATCH. The editor and Open store action use the stable preview alias, and deployed starter routes use Vue history paths rather than the legacy hash-route fallback.
- Before the initial builds start, provisioning upserts `VITE_API_BASE_URL=https://markit-custom-api.vercel.app/api` plus the authenticated company's ID as `VITE_COMPANY_ID` into both Vercel Preview and Production environments. It also sets `VITE_EDITOR_ORIGIN` to the same configured editor-origin allowlist in both environments; the default is `http://localhost:3000,https://local.markit.co.in,https://markit.co.in`. These are Vite build-time variables, so they must exist before creating the `preview` and `main` deployments; the company ID is server-derived and never accepted from the browser.
- The editor's `StorefrontChatSlideover` starts and polls authenticated Storetools routes under `/api/ecommerce-cms/storefront-agent/`; it no longer depends on the public Cloud Run chat service for active requests. Storetools starts `antigravity-preview-05-2026` with stored background execution, no application-set token budget, and a dedicated `system_instruction`. Its remote Interactions environment mounts only the authenticated company's private repository and injects a short-lived GitHub App token through Google's network proxy. Storetools preserves the environment/latest-interaction chain server-side for resumable multi-turn chat; resumed turns pass a full `{ type: 'remote', environment_id, network }` update so filesystem state and conversation context remain linked while credentials are replaced. Status polling retries transient Gemini `429`/`5xx` responses and, after exhausted retries, returns a reconnecting stage so a temporary gateway timeout does not terminate the browser chat. Company-scoped recent-chat APIs restore stored messages while the UI maps Gemini terminal statuses and observed execution-step types into container, thinking, code, file, tool, finalization and deployment activity. Agent instructions explicitly hydrate the mounted clone's otherwise-narrow `preview` refspec, require reading repository docs/skills, prohibit edits to `storefront_api_docs`, and permit commits/pushes only on `preview`. Images are accepted as inline Antigravity image inputs. Selected-element prompts include editor page slug, storefront route, stable preview-only component name/source hierarchy, CSS/DOM identity and viewport placement. Storetools records the initial `preview` commit, compares it after completion, and explicitly starts a Vercel preview deployment only when the branch changed. The editor then refreshes the stable preview alias immediately and again while that build finishes.
- **Current editor runtime (supersedes the older Antigravity transport description above):** Storetools keeps the company-scoped readable transcript in `storefront_agent_sessions`. `orchestrator/server.js` marks a claimed generic Cloud Run sandbox `processing` for the whole turn, then marks it `idle` and reserves the warm slot to the authenticated user for 15 minutes after the response. That user reuses the slot while switching, creating, or forking conversations; when the requested conversation differs from the slot's hydrated conversation, the orchestrator restores the requested Pi JSONL in the same slot. A user with a processing slot is not assigned a second slot. After 15 minutes any user may atomically claim the oldest idle slot with `FOR UPDATE SKIP LOCKED`, and a warm stale slot is always torn down before the new repository/session is hydrated. If every slot is processing or still reserved, the turn remains FIFO-queued in PostgreSQL and status polling retries allocation without a cron, heartbeat, or Cloud Run instance probing. Hydration clones the seller repository's durable `preview` branch, downloads the latest Pi append-only JSONL session from the row's `storage_uri`, and opens it through the Pi SDK's `SessionManager`. A successful turn is not reported complete until `/api/save` commits/pushes `preview`, `/api/export` uploads the live Pi session file to `sessions/{conversationId}/latest.jsonl` in the private session bucket without stopping Pi, and PostgreSQL records `storage_uri` plus `pi_session_id`. OpenCode-era JSON is deliberately not converted; its readable PostgreSQL transcript remains, and the first Pi turn creates new model context. The latest turn also persists a structured `timing_report`: Storetools measures authenticated request preparation; the orchestrator measures slot assignment, Cloud Run contact/cold-vs-warm detection, save, JSONL upload and PostgreSQL work; the sandbox measures workspace preparation, clone, JSONL restore, dependency setup, Pi session readiness, task dispatch and agent processing. `ChatSlideover.vue` renders every span and its live/final duration, including after reopening the chat, but seller-facing messages, restored replies, errors, activity, and timing labels are vendor-neutral and sanitize the internal runtime name to “AI agent.” After a changed preview branch is pushed, the editor's active build watcher queries Vercel's latest `preview` deployment every three seconds and refreshes the stable preview iframe as soon as the new deployment is `READY`; the webhook is only a fast path. `latestVercelDeployment()` normalizes the v6 API's `uid` field to the internal deployment `id` so PostgreSQL and the watcher compare a real deployment identifier. A turn has a hard 60-minute processing cutoff; polling the old turn or a later allocation request aborts and tears down an overdue Pi process, reports the old turn timed out, and starts the normal 15-minute idle reservation. Failed teardown quarantines the slot. Cloud Run pool services use zero minimum instances, a 3600-second request timeout, instance CPU allocation, and startup CPU boost. The Pi runtime loads container-owned tenant guard, design-system guardian, initial-rollout planner, managed-preview, and completion-gate extensions. The first confines writes and prevents agent-driven publishing; the design extensions require `.agents/skills/storefront-design/SKILL.md`, keep deliberate new visual rules synchronized with it, plan the initial full-site rollout, and require responsive/build/commerce-flow checks before completion. Managed preview starts or restarts the storefront dev server as a detached background process, exposes its health to Pi, and prevents a foreground dev-server command from blocking task completion.
- **Stop, Undo, Fork, and browser verification:** During queued, hydration, or active execution, the chat Stop control moves the interaction through `stopping` to `stopped`. The sandbox aborts Pi and hard-resets the disposable clone to the turn's recorded base SHA; if that turn already pushed before cancellation won the race, the orchestrator creates and pushes an ordinary inverse Git commit instead of rewriting history. Code-changing assistant replies persist server-trusted before/after SHAs and show Undo; Undo rehydrates that conversation, reverts only its commit range, pushes the inverse commit, exports the updated Pi JSONL, and disables copied Undo controls for the same interaction. Fork copies the client-visible transcript through the selected assistant reply and uses Pi's `SessionManager.createBranchedSession(leafId)` to create a new GCS-backed JSONL branch with actual agent context only through that leaf. The container-owned `storefront-playwright` skill is mandatory when the seller requests UI testing and for long/complex browser-facing work; it runs Chromium against the managed preview at desktop and mobile sizes, checks browser/runtime failures and key flows, and loops test-fix-test before final build/save.
- **Active-task queue and steering:** `ChatSlideover.vue` keeps the composer enabled while a task is active. Queue stores editable/removable follow-up messages in `storefront_agent_sessions.queued_messages`; after a turn completes, the UI submits the oldest message through the normal authenticated chat route and removes it only after the next turn is accepted. Steer sends immediate additional guidance through Storetools `POST /api/ecommerce-cms/storefront-agent/steer` to orchestrator `POST /agent/steer`, which verifies conversation/user ownership and the active `running` slot before calling sandbox `POST /api/steer`; the sandbox uses Pi SDK `active.session.steer()`, so guidance is delivered after the current assistant tool calls and before its next model step. Queue CRUD remains in Storetools/PostgreSQL rather than Pi's internal queue so individual pending messages can be listed, edited, removed, and restored after a browser refresh.
- **Plan mode:** `ChatSlideover.vue` exposes a small Plan toggle plus durable Execute, Refine, and Cancel controls. Storetools classifies substantial multi-area tasks into automatic plan mode with a deterministic scope heuristic; manual selection always wins. The container-owned `plan-mode.js` extension removes Pi's `edit` and `write` tools before the planning prompt starts, restricts bash to repository inspection, invokes the `storefront-planning` skill for an implementation-ready numbered plan, and persists phase/steps in Pi JSONL custom entries. Storetools mirrors that state into `storefront_agent_sessions.plan_state` so it survives Recent-chat reopen. Planning, refinement, and cancellation turns still export JSONL but deliberately skip `/api/save`, Git push, and Vercel refresh. Execute restores the prior tools and injects the approved remaining steps into the agent turn.
- **Vision, durable chat images, and seller BYOK:** `/ai/models` lets a company save multiple named OpenAI, OpenRouter, Gemini, or HTTPS OpenAI-compatible model connections. Storetools encrypts each API key with AES-256-GCM and exposes metadata only. The storefront model menu merges enabled company models as `byok:{credentialId}` with built-ins, and attaching an image never changes the selected model. The authenticated storefront-agent chat request uploads each original image once from the browser; Storetools fans the same bytes out to a company/conversation-scoped R2 `storefront-agent/` key for history and to the orchestrator's encrypted queued payload for Pi. Only the resulting `https://images.markit.co.in/...` URL, MIME type, and optional name enter the PostgreSQL transcript, so images render inline after Recent-chat reopen. The sandbox materializes original bytes under the git-excluded `.markit/chat-inputs/<turn>/` and injects absolute local paths plus the durable chat URLs into Pi. Pi must copy a requested asset into the repository's existing tracked public/source asset directory and reference that copy; storefront code must never reference `.markit/chat-inputs`. Qwen3 Coder 480B can therefore add an attached file without visually understanding it and is explicitly told not to claim pixel knowledge. Built-in Gemini and image-enabled BYOK models receive both the local asset path and Pi image content for visual inspection. Custom provider calls pass through the sandbox's loopback relay, and keys/base64 exist only in the encrypted queued payload and in-memory runtime, never in the readable PostgreSQL transcript or storefront repository. Storetools signs every orchestrator request with a timestamped HMAC derived from the dedicated `ORCHESTRATOR_SHARED_SECRET`; the public orchestrator rejects every unsigned or invalid `/agent/*` request while leaving `/api/health` public. The database URL is not used as an API-signing key.
- **Initial design onboarding:** once repository/Vercel provisioning is ready, `pages/storefront/editor.vue` gates a storefront without a ready design profile behind `DesignOnboarding.vue`. The form collects company/products, one design direction, optional Figma URL, font/logo/asset links and uploaded font/logo/image files, visual reference images, and other notes, and requires an image-capable model. Uploaded assets are transported inside the encrypted queued runtime payload, materialized only under the sandbox's git-excluded `.markit/design-inputs/`, and copied into tracked storefront assets only when Pi actually uses them. `POST /api/ecommerce-cms/storefront-design` starts a dedicated `[MARKIT_INITIAL_DESIGN]` Pi conversation. Pi inventories the full customer-facing application, creates the canonical repository skill at `.agents/skills/storefront-design/SKILL.md`, applies it across shared primitives/layouts/routes, builds/checks the result, and follows the normal preview commit, Pi JSONL export, PostgreSQL, and Vercel refresh lifecycle. The profile becomes `READY` only after the agent conversation completes; failed runs can be retried.
- `GET /api/custom/{company_id}/bootstrap` returns company, categories, collections, FAQs, feedback, blogs, and collection product sections. Blog image keys are expanded to `imageUrl` through `image_url()`.
- `revomotive/client/src/stores/catalog.js` stores `feedback` and `blogs` from bootstrap alongside company/category/collection/FAQ data.
- `revomotive/client/src/views/HomeView.vue` renders live feedback in the review rail, live blogs in the featured blog cards, and asks for subscriber name plus either phone number or email.
- `revomotive/client/src/views/BlogView.vue` renders live bootstrap blogs, falling back to local static cards if no CMS blogs are present.
- `GET /api/custom/{company_id}/gallery` serves storefront media from `ecomm_gallery` — both `PHOTO` and `VIDEO` rows, optionally filtered with `?type=`. Each row carries an uploaded R2 object (`mediaKey` → expanded `mediaUrl`), an external link (`url`: YouTube for video, image URL for photo), or both. Legacy `YOUTUBE` rows are reported as `VIDEO`. Sellers manage this in storetools `pages/ecommerce-cms/gallery.vue`, which has separate Photos/Videos tabs and uploads files straight to R2 via `POST /api/r2/upload-url`.
- `revomotive/client/src/views/HomeView.vue` "In motion" rail plays gallery videos: uploaded clips render in a `<video>` element, YouTube-link rows in the IFrame Player API embed. When a row has both, the upload plays and the link becomes the click-through target.
- `revomotive/client/src/views/LoginView.vue` and `hijabcart/client/src/views/LoginView.vue` use phone-number login: the first step asks only for phone and requests `POST /auth/whatsapp/otp`; the response includes whether the phone is already linked to the current company. Existing company clients verify OTP only. New company clients must provide full name, email, and gender with the OTP in `POST /auth/whatsapp/verify`; ecommerce-api saves those fields, links `company_clients`, and OTP expires after 10 minutes. The WhatsApp sender uses the `login_otp` template and falls back to `server/.env` WhatsApp credentials when its own env is blank.
- `POST /api/custom/{company_id}/subscribe` creates or finds the client by phone or email, fills an empty client name from the submitted name, and links the client to `company_clients`, so subscribers appear in storetools `/client`.
- `GET/POST/PUT /api/custom/{company_id}/addresses` manage logged-in client addresses. Address rows store `firstName`, `lastName`, and `phoneNo` alongside the existing street/locality/city/state/pincode fields; the cart form pre-fills these from the `clients` row when possible.
- `revomotive/client/src/views/CartView.vue` contains cart items plus a compact selected-address block. The main cart page renders only the selected address with Change/Add actions; address list selection is behind the Change sheet. The selected address is stored in `localStorage` for `/checkout`.
- `storetools/pages/ecommerce-cms/policies.vue` manages default policy pages (refund, return, terms and conditions, privacy, cookies, shipping, cancellation) plus seller-created custom policies. Policy content is edited as HTML through the same lightweight contenteditable editor pattern used by the blogs CMS page. Policies are stored as `GeneralPreference` JSON using `pageName = 'ecommerce_policies'` and `key = 'policies'`; the Storetools Storefront tab links this page under Content, while Coupons remains outside Storefront navigation.
- `GET /api/custom/{company_id}/coupons` lists eligible Markit/company cart coupons for the logged-in custom storefront client; `PRIVATE` audience coupons are excluded from this discovery response. `POST /api/custom/{company_id}/coupons/apply` validates a manually entered coupon code and permits an exact matching `PRIVATE` code subject to the same active-date, type, target, minimum-order, and usage-limit rules. Checkout revalidates the returned coupon ID without exposing it in discovery. The cart promo row opens a bottom sheet with the eligible coupons plus a manual-code input.
- `hijabcart/client/src/views/CartView.vue` owns payment method selection; when the company `codCharge` is above zero it shows the amount in red above the COD label and includes a separate COD-charge summary row. `CheckoutView.vue` repeats the charge in its payment card and summary, and includes it in the advisory total only while COD is selected.
- `hijabcart/client/src/views/CheckoutView.vue` owns order placement through `POST /checkout`. It sends a payload-specific idempotency key and the signed token returned by `/shipping/quote`; checkout ignores browser totals, recomputes prices/coupon/tax/delivery discount and the company-owned flat COD charge, aggregates duplicate item rows, creates the bill/order/entries, and performs a guarded stock decrement in one transaction. Online payment creates the checkout first, initiates the gateway against the returned `grandTotal`, verifies the gateway result, then settles the existing checkout.
- `hijabcart/client` product, cart, and order-detail views render the single `items.size` option using the variant-configured `sizeLabel` (for example, the label may read “Shade”). Catalog responses keep every configured item option for an otherwise in-stock variant, including `qty = 0`; product-detail and quick-add selectors render those unavailable options grey with a diagonal strike and disable selection. The cart store also rejects zero-stock additions. Cart identity and checkout remain keyed by the exact `itemId`; the current `Item` schema does not store an independent second shade value.
- `ecommerce-api` catalog responses expose `items[].size`; checkout snapshots that value into `ecomm_orders.items` and the linked bill `Entry`, then decrements stock for the same `item_id`. Auto-approved cancellation restores `items.qty`, reduces `sold_qty`, cancels the ecommerce checkout/order and linked bill, and reverses coupon usage in the same transaction.

### `pages/store/[[company]]/index.vue` — Store Homepage
Route: `/store/{companyName}` (optional param — works without company name too)

`definePageMeta({ auth: false, layout: 'store' })` — uses the `store` layout, no auth required

**Data fetching (ZenStack hooks, lazy-loaded client-side):**
- `useFindManyProduct(queryArgs)` — paginated product list (12/page), includes company + variants (with items) + category
- `useFindManyProduct` (trending) — latest 8 products with stock
- `useFindManyCategory` — categories with `products.some({ status: true, variants.some({ images.isEmpty: false }) })`

**Filters (reactive, reset page on change):**
- Text search (`name contains`)
- Category filter
- Price range (₹0–50,000) via dual `URange` sliders
- Discount range (0–100%)
- In Stock Only toggle

**Sorting (client-side on `flatVariants`):**
- Newest (default) — createdAt desc
- Price Low to High — sorted by `dprice || sprice`
- Price High to Low — same, reversed
- **Bug:** server-side `orderBy` always uses `{ createdAt: 'desc' }` regardless of sort selection — sorting is only applied client-side

**`flatVariants` computed:** flattens products → variants, computes `totalQty` from `items`, marks `isOutOfStock`, builds `mainImage` URL (`https://images.markit.co.in/{key}`), computes `discountPercentage`; sorts in-stock first

**Infinite scroll:** `useDebounceFn` scroll handler → `loadMore()` increments page + `refetch()`

**Quick View modal:** opens on `ProductsProductCard` emit; shows image carousel (auto-rotate 3s), price/description, size selection, add to cart / like buttons

**Stores used:**
- `useCartStore` — cart count badge + `addToCart()`
- `useLikeStore` — wishlist toggle + `likedCount` badge
- `useClientAuth` — buyer session (separate from seller auth)

**Navbar:** Login button (if not logged in), Cart chip, Wishlist chip

**Bugs:** `console.log(NEWflatVariants)` in watch — logs all variants on every product load

---

### `pages/store/[[company]]/products/[id].vue` — Product Detail Page
Route: `/store/{company}/products/{id}?variant={variantId}`

**Data:** `useFindUniqueProduct({ where: { id: route.params.id }, include: { company, variants: { include: { items } } } })`

**Pre-selected variant:** `?variant=` query param scrolls to and pre-selects the variant matching `variantId` on load

**Add to cart:** dropdown of available sizes from `variant.items`; disabled if `size.qty === 0`; calls `cartStore.addToCart()`

**Like toggle:** `likeStore.toggleLike()` with `variantId`

**Bugs:** `console.log(index)` on variant selection, `console.log("Company item:", product.value.companyId)` in computed

---

### `pages/store/[[company]]/categories/[id].vue` — Category Product Page
Route: `/store/{company}/categories/{id}`

**Data:** `useFindManyCategory({ where: { id } })` for category metadata + `useFindManyProduct` for products in that category; paginated (12/page), infinite scroll

**Rendering:** Flattens products → variants into `flatVariants`; same `ProductsProductCard` grid as the homepage

`definePageMeta({ auth: false, layout: 'store' })`

---

### `pages/store/[[company]]/checkout/index.vue` — Store Checkout
Route: `/store/{company}/checkout`

**Purpose:** Customer checkout for the in-store (storetools) e-commerce — creates a `Bill` directly via ZenStack (not via the `server/` Express API).

**Data/hooks:** `useCreateBill`, `useFindFirstCompany`, `useUpdateVariant`, `useUpdateItem`, `useUpdateCompany`

**Cart source:** `useCartStore` (Pinia) — reads items, passes to bill creation

**Bill creation:** ZenStack `useCreateBill` — creates entries for kept cart items, increments `Company.billCounter`

**Checkout options:** payment method, booking date (for bookings), delivery fees

**Auth guard:** redirects to login modal if `useClientAuth` session has no `id`

---

### `pages/store/[[company]]/orders/index.vue` — Customer Order History
Route: `/store/{company}/orders`

**Data:** `useFindManyBill({ where: { clientId: session.value?.id, deleted: false, NOT: { type: 'BILL' } } })` — shows bookings and Try N Buy bills for the logged-in client

**Includes:** entries (with category + variant), address

**Auth guard:** shows login modal if client not authenticated (`watch` on `session.value?.id`)

---

### `pages/store/[[company]]/wishlist.vue` — Wishlist
Route: `/store/{company}/wishlist`

**Data:** `useFindManyVariant({ where: { id: { in: effectiveLikedIds } } })` — fetches only the variants the client has liked

**`likeStore`:** provides `likedItems[]` (from Pinia/localStorage); `effectiveLikedIds` excludes locally-removed items for optimistic UI

**Remove from wishlist:** `likeStore.toggleLike(item)` — also calls `cartStore.addToCart()` option

`definePageMeta({ auth: false, layout: 'store' })`

---

### `pages/store/[[company]]/settings/index.vue` — Store Customer Profile Settings
Route: `/store/{company}/settings`

**Data:** `useFindUniqueClient`, `useUpdateClient`, `useFindManyAddress`, `useCreateAddress`, `useUpdateAddress`, `useDeleteAddress`

**Sections:** profile (name edit), address management (list + add/edit/delete)

**Auth guard:** shows login modal if `useClientAuth` session has no `id`

`definePageMeta({ auth: false, layout: 'store' })`

---

### `pages/settings/notifications.vue` — Notification Preferences (Stub)
Historical template page only. The file is not in the current Storetools page tree; do not treat `/settings/notifications` as a live route.

---
