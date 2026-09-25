# AI Chat System

The AI chat is a slideover panel in storetools that lets users interact with store data via natural language (text, voice, images, files). It connects to a Markit MCP server through Gemini as the LLM. WhatsApp now reuses the same `AiChat` / `AiChatMessage` store through a separate webhook flow, with sessions separated by `channel`.

---

## Architecture Overview

```
ChatBox.vue (frontend)
  │
  ├── POST /api/ai/chat    ← text messages
  ├── POST /api/ai/media   ← voice / image / file
  └── GET /api/ai/chats    ← web history list (WEB + bound WhatsApp sessions)
  │
  └── server/utils/aiChat.ts (shared logic)
        │
        ├── Gemini 2.5 Flash (LLM)
        ├── MCP Client → mcp/dist/index.js (stdio)
        │     └── Tools: create_product, create_purchase_order, list_products, etc.
        ├── R2 upload (server/utils/r2.ts)
        └── Prisma persistence (AiChat + AiChatMessage)

WhatsApp webhook
  └── server/api/whatsapp/webhook.ts
        └── server/utils/whatsappAi.ts
              ├── phone → CompanyUser lookup
              ├── pending company selection or ACTIVE session binding
              └── shared AiChat + AiChatMessage persistence
                  └── text / voice note / image / PDF media handling
```

---

## DB Models

### AiChat (`ai_chats`)

| Field | Type | Notes |
|---|---|---|
| `id` | String (UUID) | PK |
| `title` | String | Auto-set from first message (first 80 chars) |
| `channel` | String | `WEB` or `WHATSAPP` |
| `sourcePhone` | String? | WhatsApp sender phone, normalized digits |
| `sessionStatus` | String | `ACTIVE`, `PENDING_COMPANY_SELECT`, or `EXPIRED` |
| `sessionStartedAt` | DateTime? | Boundary used to exclude WhatsApp auth handshake messages from AI context |
| `lastSeenAt` | DateTime? | Refreshed on each inbound WhatsApp message |
| `expiresAt` | DateTime? | WhatsApp session TTL, 1 hour after `lastSeenAt` |
| `companyId` | String? | FK → Company (nullable until WhatsApp company selection completes) |
| `userId` | String? | FK → User (nullable until WhatsApp company selection completes) |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | Touched on every new message |

### AiChatMessage (`ai_chat_messages`)

| Field | Type | Notes |
|---|---|---|
| `id` | String (UUID) | PK |
| `chatId` | String | FK → AiChat (cascade delete) |
| `role` | String | `'user'` or `'assistant'` |
| `content` | String | Text content (or placeholder like `[Voice message]`, `[Image]`) |
| `toolCalls` | Json? | `ToolCallRecord[]` — MCP tool name, args, result. Hidden from UI but sent to Gemini on subsequent requests |
| `attachments` | Json? | `[{type, url, name, size, duration, mimeType}]` — R2 URLs for voice/image/file |
| `createdAt` | DateTime | |

---

## API Endpoints

### Chat CRUD

| Route | Method | Purpose |
|---|---|---|
| `/api/ai/chats` | GET | List recent chats for the active company/user context, including bound WhatsApp sessions (last 50, ordered by updatedAt desc) |
| `/api/ai/chats` | POST | Create a new empty chat |
| `/api/ai/chats/:id` | GET | Load chat with all messages (including toolCalls + attachments) |
| `/api/ai/chats/:id` | DELETE | Delete chat + all messages (cascade) |

### Message Endpoints

| Route | Method | Body | Purpose |
|---|---|---|---|
| `/api/ai/chat` | POST | `{ messages, chatId? }` | Text message. Runs agentic loop, persists user+assistant messages, returns `{ reply, toolCalls, chatId }` |
| `/api/ai/media` | POST | `{ media: [{data, mimeType, name?}], text?, history, chatId? }` | Voice/image/file. Uploads to R2, sends to Gemini as inlineData, runs agentic loop. Returns `{ reply, toolCalls, chatId, uploaded }` |

### WhatsApp

| Route | Method | Purpose |
|---|---|---|
| `/api/whatsapp/webhook` | GET | Meta webhook verification |
| `/api/whatsapp/webhook` | POST | Inbound WhatsApp message handling. Resolves `CompanyUser` by sender phone, creates or resumes a WhatsApp `AiChat` session, and routes text, voice note, image, and PDF media through Gemini + MCP |

---

## Key Files

### Frontend

| File | Purpose |
|---|---|
| `components/AiChat/ChatBox.vue` | Main chat UI — message list, text input, mic button, file picker, chat history list, new chat |
| `components/AiChat/ChatMessage.vue` | Single message renderer — markdown for assistant, attachment rendering (voice waveform, image thumbnail, file icon) |

### Backend

| File | Purpose |
|---|---|
| `server/api/ai/chat.post.ts` | Text message endpoint — uses shared helpers from aiChat.ts |
| `server/api/ai/media.post.ts` | Media endpoint — handles voice, images, files. Uploads to R2, sends to Gemini |
| `server/api/ai/chats.get.ts` | List chats |
| `server/api/ai/chats.post.ts` | Create chat |
| `server/api/ai/chats/[id].get.ts` | Load chat with messages |
| `server/api/ai/chats/[id].delete.ts` | Delete chat |
| `server/utils/aiChat.ts` | Shared logic: system prompt, schema conversion, Gemini tool building, agentic loop, content replay, DB persistence |
| `server/utils/mcpClient.ts` | MCP client singleton — connects to `mcp/dist/index.js` via stdio |
| `server/utils/whatsappAi.ts` | WhatsApp session resolver — phone lookup, company selection prompt, 1-hour TTL, active session binding, Gemini/MCP turn handling |
| `server/utils/r2.ts` | Server-only R2 client backed by private Nuxt runtime config; provides base64/buffer uploads, presigned PUT upload URLs, batched `deleteFromR2`, and one-hour signed GET URLs. Credentials are never placed in `runtimeConfig.public`. |
| `server/utils/mediaCleanup.ts` | Deletes R2 objects when the row referencing them is removed or its image replaced. `filterUnreferencedKeys` checks every table that stores a key (`variants.images`, category/subcategory/brand/collection image+banner, `companies.logo/images`, `users.image`, `distributors.images`, `ecomm_blogs.image`, `ecomm_gallery.media_key`) so a key still in use is never deleted; lazily-provisioned tables are skipped when absent. `cleanupMediaKeys` never throws — cleanup runs after the user's write has already succeeded. AI chat attachments (JSON) are deliberately out of scope. |

### MCP Server

| File | Purpose |
|---|---|
| `mcp/src/index.ts` | MCP server entry — registers all tools with Zod schemas |
| `mcp/src/tools/products.ts` | Product CRUD, variant update, item delete, stock summary, barcode search |
| `mcp/src/tools/purchaseOrders.ts` | PO CRUD, distributor list |
| `mcp/src/tools/catalog.ts` | Brand, category, subcategory CRUD |
| `mcp/src/tools/expenses.ts` | Expense CRUD, expense category CRUD |
| `mcp/src/tools/finance.ts` | Investment CRUD, money transaction CRUD |
| `mcp/src/tools/accounts.ts` | Bank account CRUD, account transfer CRUD, cash/bank ledger read |
| `mcp/src/tools/distributors.ts` | Distributor CRUD, distributor payment/credit create. `create_distributor_credit` accepts a `creditKind: 'PRODUCT' \| 'AMOUNT'` flag (default `PRODUCT` for back-compat). For `AMOUNT`: requires `paymentMode: 'CASH' \| 'BANK'`, optional `bankAccountId` (omit = primary bank), wraps both inserts in a `BEGIN/COMMIT` block — first inserts a `money_transactions` row (`party_type=SUPPLIER`, `direction=RECEIVED`, `status=PAID`, note `"Distributor credit from {name}: {remarks}"`) then the `distributor_credits` row with `money_transaction_id` set. Rejects `purchaseOrderId` when `creditKind=AMOUNT`. AMOUNT credits flow through cash/primary-bank/secondary-bank ledgers automatically (same pattern as the storetools UI Add Credit modal) and are excluded from GSTR-2B/3B Table 4 ITC. |
| `mcp/src/tools/statementMappings.ts` | `save_statement_rows` (batch+rows to DB), `find_statement_mappings` (30% keyword auto-match) |
| `mcp/src/tools/reports.ts` | `generate_report` — PDF/Excel report generation (sales, profit, expense, stock, gst1, distributor) |
| `mcp/src/tools/settings.ts` | 13 settings tools — `get_settings`, `update_store_identity`, `update_store_policies`, `update_billing_settings`, `update_delivery_settings`, `update_business_hours`, `update_bank_details`, `update_opening_balance`, `update_store_address`, `update_feature_toggles`, `update_product_inputs`, `update_variant_inputs`, `update_printer_settings`. All use raw SQL via pg pool. |
| `mcp/src/lib.ts` | Direct-import entry point for Nuxt server — exports `allTools` + `callTool()`. Used by storetools AI chat instead of spawning MCP stdio process. Includes all tools (products, catalog, expenses, finance, accounts, distributors, statements, reports, queryDb, **settings**). |
| `mcp/src/db.ts` | pg Pool connection for MCP server |
| `mcp/src/types.ts` | Shared types (VariantInput) |

---

## Agentic Loop

The agentic loop in `aiChat.ts` runs up to **8 iterations**:

1. Send conversation contents + tools to Gemini
2. If Gemini returns `functionCall` parts → execute each via MCP (injecting `companyId`)
3. Append function responses to contents
4. Loop back to step 1
5. If Gemini returns text (no function calls) → return reply

All tool calls are recorded as `ToolCallRecord[]` (`{ tool, args, result }`) and:
- Returned to frontend (stored on assistant message, hidden from UI)
- Persisted to DB as JSON
- Replayed as Gemini `functionCall`/`functionResponse` pairs on subsequent requests so the model retains full tool history

### Conversation Replay

When rebuilding contents from chat history, tool calls are replayed **before** the assistant's text response to maintain Gemini's strict model/user alternation:

```
model: functionCall(create_purchase_order, {...})
user:  functionResponse(create_purchase_order, {purchaseOrderId: "xxx"})
model: functionCall(create_product, {poId: "xxx", ...})
user:  functionResponse(create_product, {productId: "yyy"})
model: "Product added! Want to add more?"   ← text last
```

---

## Media Handling

### Voice
- Recorded via `MediaRecorder` (WebM/Opus preferred)
- Sent as base64 to `/api/ai/media`
- Uploaded to R2 at `ai-chat/{companyId}/{uuid}.webm`
- Gemini processes audio natively (no separate STT step)
- Rendered in chat as waveform bar + duration

### Images
- Selected via file picker (accepts `image/*`)
- Sent as base64 to `/api/ai/media`
- Uploaded to R2 at `ai-chat/{companyId}/{uuid}.jpg`
- Gemini processes image natively (vision)
- Rendered in chat as thumbnail (clickable to open full)

### Files (PDF, docs, etc.)
- Selected via file picker
- Sent as base64 to `/api/ai/media`
- Uploaded to R2 at `ai-chat/{companyId}/{uuid}.pdf`
- Rendered in chat as document icon + filename + size

### Pending Attachments
Before sending, attachments show as a preview bar above the input. Users can remove individual attachments before sending. Text can be sent alongside attachments.

---

## MCP Tool Returns

All mutation tools return IDs and key fields so the AI can reference them in follow-up calls:

- `create_product` → `productId, productName, purchaseOrderId, brandId, categoryId, variantCount, poSubTotalAmount, poTotalAmount`
- `create_purchase_order` → `purchaseOrderId, purchaseOrderNo, billNo, paymentType, totalAmount, subTotalAmount`
- `update_*` tools → return updated record fields
- `delete_*` tools → return deleted entity ID and name
- Error responses from `create_product` include `purchaseOrderId` so the AI doesn't lose the PO reference

### PO Amount Recalculation

When `create_product` is called, it recalculates the parent PO's `subtotal_amount` (SUM of `p_price * qty` across all items) and `total_amount` (`subtotal - discount + tax + adjustment`) within the same transaction.

---

## UI Integration

- Chat panel is a `UDashboardSlideover` toggled by `Ctrl+B` keyboard shortcut
- Rendered in `layouts/default.vue`
- State managed via `useDashboard().isChatSlideoverOpen`
- The web chat history list shows both `WEB` chats and bound WhatsApp sessions; pending WhatsApp company-selection chats stay hidden until they are bound.

### Chat History Panel
- Clock icon toggles chat list view
- Shows last 50 chats sorted by recent
- Click to open, hover to show delete button
- Active chat highlighted
- Plus icon starts new chat

---

## Environment Variables

| Variable | Used by |
|---|---|
| `GEMINI_API_KEY` | aiChat.ts — Gemini API calls |
| `DATABASE_URL` | Prisma — chat persistence |
| `R2_ID` | r2.ts — Cloudflare R2 auth |
| `R2_SECRET` | r2.ts — Cloudflare R2 auth |
| `R2_BUCKET` | r2.ts — bucket name (`markitpro`) |
| `R2_ACCOUNT_ID` | r2.ts — R2 endpoint |
| `MCP_SERVER_PATH` | mcpClient.ts — path to `mcp/dist/index.js` (defaults to `../mcp/dist/index.js`) |

---

## Bank Statement Processing

Two entry points for uploading bank statements:
1. **AI Chat** — user uploads PDF/image in chat → Gemini extracts rows → MCP `save_statement_rows` saves batch → MCP `find_statement_mappings` auto-matches → redirects to `/statement/[batchId]`
2. **Bank Detail Page** — `accounts/bank/[id].vue` has "Upload Statement" button → `POST /api/statement/upload` extracts rows via Gemini + saves batch + auto-matches → redirects to `/statement/[batchId]?bankAccountId=[id]`

### Shared Helpers (`server/api/statement/_helpers.ts`)

| Function | Purpose |
|---|---|
| `fetchCompanyContext(companyId)` | Parallel queries for categories, users, distributors, bank accounts, primary bank — all with IDs |
| `classifyRow(row, userInput, bankAccountId, context)` | Builds rich AI prompt with full DB context (IDs included), calls Gemini `gemini-3-flash-preview`, returns `{operation, operationMeta, operationLabel}` |
| `executeOperation(row, operation, meta, companyId)` | Switch/case creating actual DB records using UUIDs from meta directly (no name lookups). Returns `{operationId, insertedData}` |
| `deleteExecutedRecord(operation, executionResult)` | Deletes old record by operationId for re-execution |
| `upsertMapping(companyId, description, operation, meta, label, userInput)` | Saves remark→operation mapping for future auto-match |
| `parseMeta(raw)` | Handles string vs object meta (pg driver varies) |

### Two-Step Flow: Assign → Execute

1. **Assign** (`POST /api/statement/find-operation`): User types instruction → AI classifies with full DB context → saves operation+meta+userInput to row → saves mapping. Does NOT create any actual record.
2. **Execute** (`POST /api/statement/execute-row`): Uses saved meta UUIDs to INSERT into correct table (expenses, account_transfers, money_transactions, distributor_payments, investments). Marks row executed.
3. **Execute All** (`POST /api/statement/execute`): Batch executes all assigned-but-not-executed rows.

### Operation Meta Format (AI returns real DB UUIDs)

| Operation | Meta fields |
|---|---|
| EXPENSE | `categoryId`, `categoryName`, `userId?`, `userName?`, `note?` |
| TRANSFER | `fromType`, `fromAccountId?`, `toType`, `toAccountId?`, `note?` |
| TRANSACTION | `partyType`, `direction`, `accountId?`, `note?` |
| DISTRIBUTOR_PAYMENT | `distributorId`, `distributorName`, `billNo?`, `purchaseOrderNo?`, `remarks?` |
| INVESTMENT | `userId`, `userName`, `direction` |
| IGNORE | null |

### Key behaviors
- **Date parsing:** DD/MM/YYYY format (Indian bank statements), stored with IST offset (+05:30)
- **Notes/remarks:** Always append bank statement description in brackets, e.g. `Rent [NEFT/HDFC/RENT PAYMENT]`
- **Name fallback:** If AI returns name but not UUID, execute looks up by name (LIKE match) before failing
- **Re-execution:** Editing an executed row resets `executed=false`; old DB record deleted on next execute
- **Error display:** Per-row errors shown in Status column (e.g. `User "Naufal" not found, please create it first`)
- **PO linking:** For distributor payments, if user mentions PO number, backend looks up `purchase_order_id` by `purchase_order_no`

### Statement Page States (`pages/statement/[id].vue`)

| Row State | UI |
|---|---|
| Unmatched | Input field + "Assign" button |
| Assigned, not executed | Badge + edit icon + "Execute" button |
| Executed | Badge + edit icon (Status column shows green checkmark) |
| Editing | Input (pre-filled with saved userInput) + "Assign" + cancel |

---

## On-Demand Tool Prefixes (`@report`, `@setting`)

The AI chat supports prefix-triggered specialized modes that filter which MCP tools Gemini sees and swap in a domain-specific system prompt.

| Prefix | Tool filter | System prompt | Tools included |
|---|---|---|---|
| `@report` | `'report'` | `getReportSystemPrompt()` — report-focused assistant | `generate_report`, `query_db` |
| `@setting` | `'setting'` | `getSettingSystemPrompt()` — settings-focused assistant | All 13 `settings.ts` tools + `query_db` |
| *(none)* | default | `getSystemPrompt()` — general assistant | All tools **except** report-only and setting-only tools. `query_db` always included. |

**Implementation:**
- `chat.post.ts` detects prefix via `userMessage.trimStart().toLowerCase().startsWith('@report')` / `startsWith('@setting')`
- Prefix is stripped before sending to Gemini: `.replace(/^@(report|setting)\s*/i, '')`
- `aiChat.ts` has `REPORT_TOOL_NAMES` and `SETTING_TOOL_NAMES` arrays used by `getGeminiToolsAndClient(toolFilter)` to filter `mcpTools`
- Default mode excludes on-demand tools (report + setting) but keeps shared tools like `query_db`

## System Prompt

Located in `server/utils/aiChat.ts`. Key instructions:
- Product creation flow: create PO first → use same `purchaseOrderId` for all products → ask if more products after each
- Never mention `companyId` to user (injected automatically)
