# AI, statement and storefront-editor pages

### `pages/ai/models.vue`

Company AI provider configuration. Lists providers and allows add, edit and delete through `/api/ai/providers`. The form supports OpenAI, OpenRouter, Gemini and custom OpenAI-compatible providers, including model ID, base URL where applicable, API key, vision capability and enabled state. A saved key is not returned to the form for display; replacement is optional when editing. Removing a provider can leave existing chats needing another available model. This page configures providers; it does not itself run a chat.

### `pages/ai/usage.vue`

AI consumption dashboard from `/api/ai/usage`. Choose 7, 30, 90 days or all time; inspect total/input/output tokens, billed cost, daily usage and recent runs. The page includes a warning when token rates are not configured, so cost figures should not be treated as authoritative in that state.

### `pages/statement/[id].vue`

Bank-statement review and execution page for a particular statement ID. Staff inspect extracted rows, assign or auto-find matching operations, review classification, and execute an individual row or the batch through the `/api/statement/find-operation`, `/api/statement/execute-row` and `/api/statement/execute` flows. Extraction and assignment do not by themselves post money movements; execution is the state-changing step. The statement-processing architecture and matching rules are in `ARCH-ai-chat.md`.

### `pages/storefront/editor.vue`

Seller-facing full-stack storefront editor. Select a storefront page slug, load its saved configuration with `GET /api/ecommerce-cms/storefront-pages/{slug}`, and edit it alongside an iframe preview and AI chat slideover. The page can seed bundled defaults for known slugs. Before editing it checks/creates storefront source via `/api/ecommerce-cms/storefront-source`, and checks the design-onboarding state via `/api/ecommerce-cms/storefront-design`. Saving dirty page config uses `PUT /api/ecommerce-cms/storefront-pages/{slug}`; publishing uses `POST /api/ecommerce-cms/storefront-source/publish`. A preview update triggers deployment-status polling, then reloads the iframe when the new deployment is ready; failure and timeout are surfaced separately. The source/deployment flow is distinct from the old `pages/store/[[company]]` routes described as historical in `ARCH-pages-store.md`.
