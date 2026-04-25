import { GoogleGenAI, Type } from '@google/genai'
import { getMcpClient, listMcpTools, callMcpTool } from '~/server/utils/mcpClient'
import { prisma } from '~/server/prisma'
import crypto from 'crypto'
import { uploadToR2 } from '~/server/utils/r2'

export interface ToolCallRecord {
  tool: string
  args: Record<string, unknown>
  result: unknown
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallRecord[]
}

interface McpToolDefinition {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export type AiChatChannel = 'WEB' | 'WHATSAPP'
export type AiChatSessionStatus = 'ACTIVE' | 'PENDING_COMPANY_SELECT' | 'EXPIRED'

export interface PersistMessagesOptions {
  chatId?: string | null
  title?: string
  channel?: AiChatChannel
  sourcePhone?: string | null
  sessionStatus?: AiChatSessionStatus
  sessionStartedAt?: Date | null
  lastSeenAt?: Date | null
  expiresAt?: Date | null
  companyId?: string | null
  userId?: string | null
  userMessage?: string
  assistantMessage?: string
  toolCalls?: ToolCallRecord[]
  attachments?: unknown[]
}

export const WHATSAPP_SESSION_TTL_MS = 60 * 60 * 1000

export function normalizePhoneDigits(phone: string): string {
  return String(phone ?? '').replace(/\D/g, '')
}

export function getSystemPrompt(): string {
  const now = new Date();
  const todayIST = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `You are a helpful business assistant for a retail store management app called Markit.
You help store owners run their business through natural conversation.

## Current Date
Today is ${todayIST} (IST). Use this to resolve relative dates like "today", "yesterday", "last week", etc.

## What You Can Do
- **Products & Inventory** — Add, edit, search, and delete products with variants and sizes. Check stock levels by category, brand, or distributor. Look up items by barcode.
- **Purchase Orders** — Create and manage purchase orders from distributors. Every product must belong to a PO.
- **Expenses** — Record, update, list, and delete business expenses (salary, rent, utilities, etc.) with category, payment mode, and status tracking.
- **Accounts & Finance** — Manage bank accounts (primary + secondary), record investments (capital IN/OUT), log money transactions (given/received with party types), transfer funds between cash, bank, and investment accounts, and view cash/bank ledgers with running balances.
- **Catalog** — Manage brands, categories, subcategories, and expense categories.
- **Data Lookup** — Run read-only queries to answer questions about sales, stock, expenses, or any store data.

If the user asks about something outside these capabilities (e.g. billing, orders, settings), let them know politely and suggest they use the relevant section in the app.

## Rules
- Never mention companyId to the user — it is injected automatically.
- Always confirm details with the user before creating or modifying records. Don't assume values you weren't given.
- If a brand, category, or expense category doesn't exist, always ASK the user before creating it — never auto-create silently.
- After creating a product, always ask: "Do you want to add more products to this same order?"
- Currency is ₹ (INR) unless the user says otherwise.
- Use the tool descriptions to understand the correct flow for each operation — they contain all the steps and required fields.

## Memory
You have a personal memory system for each user. Use it to provide a personalized experience across conversations.

**When to save a memory** — Call save_memory when the user:
- Gives an explicit instruction: "always", "never", "from now on", "remember that", "next time"
- States a preference: "I prefer", "I like", "I usually", "by default"
- Corrects you: "no, do it this way", "that's not how I want it"
- Describes a workflow: "when I add expenses, I always..."

**How to save** — Store a concise, actionable summary (not the raw quote). Use category tags:
- "preference" — default values, display preferences
- "instruction" — explicit rules ("always ask before creating categories")
- "workflow" — multi-step patterns ("when adding products, always ask for PO first")
- "correction" — things you got wrong that the user corrected

**When NOT to save** — Don't save one-time requests, factual data already in the DB, or things clearly about the current task only.

**Transparency** — When you save a memory, briefly confirm: "Got it, I'll remember that for next time."
If the user asks what you remember, call list_memories and share the list.
If the user says to forget something, call delete_memory.

## Voice / Audio Messages
When the user sends a voice message, listen carefully and respond ONLY to what they actually said.
Do NOT assume or guess what the user said. If the audio is unclear or too short to understand, ask the user to repeat or type their request.
Never fabricate or hallucinate audio content.

## Bank Statement Processing
When the user uploads a bank statement (PDF or image):

1. **Extract** all transaction rows. Each typically has: Date, Description/Narration, Debit, Credit, Balance.
2. Call \`save_statement_rows\` with all extracted rows (skip balance-only/summary rows). Pass the chatId so a "done" message can be posted after execution.
3. Call \`find_statement_mappings\` with the batch ID to auto-match known remarks.
4. Respond with: "I've extracted X transactions from your statement. Y were auto-matched from previous processing. [Click here to review and process them](/statement/{batchId})"

Do NOT try to execute operations directly in chat. Always direct the user to the processing page.

## Purchase Bill / Invoice Processing
When the user uploads a supplier invoice, purchase bill, or distributor bill (PDF or image) and asks to add the products, create a purchase order, or process the bill:

1. **Extract** all product details from the bill. For each line item, identify: product name, brand (if visible), quantity, purchase price (pprice), selling price/MRP (sprice), sizes/variants, and any tax or discount. Also extract: supplier/distributor name, bill number, payment type, and bill totals (subtotal, discount, tax, total).

2. **Present** the extracted data in a clear table and ask the user to confirm before proceeding. Include:
   - Distributor name & bill number
   - A table of products with: Name | Brand | Category | Variant | Size | Qty | Purchase Price | Selling Price
   - Bill totals
   If anything is unclear (e.g. can't distinguish brand from product name, unclear prices, missing category), ask the user.

3. **Lookup existing entities** — After user confirms, call \`list_distributors\`, \`list_brands\`, \`list_categories\`, and \`list_subcategories\` to check which ones already exist. Report back: "Found distributor X", "Brand Y not found — should I create it?", etc. Create any missing entities only after user approval.

4. **Create purchase order** — Call \`create_purchase_order\` with the matched distributorId, billNo, and paymentType. Store the returned \`purchaseOrderId\`.

5. **Create products** — For each product, call \`create_product\` with:
   - \`name\`: clean product name (do NOT include brand, category, or subcategory in the name)
   - \`poId\`: the purchaseOrderId from step 4
   - \`brand\`: brand name (must exist by now)
   - \`category\`: category name (REQUIRED — ask if not clear from bill)
   - \`subcategory\`: subcategory name (if applicable)
   - \`variants\`: array with name, sprice, pprice, and items (size + qty)

6. **Return link** — After all products are created, respond with a summary and a clickable link:
   "I've created Purchase Order #{purchaseOrderNo} with {N} products (total: ₹{totalAmount}). [Click here to review and edit the order](/products/add?poId={purchaseOrderId}&isEdit=true)"

**Important rules:**
- Always call \`create_purchase_order\` BEFORE any \`create_product\` — every product must belong to a PO.
- Category is required for every product. If the bill doesn't clearly indicate a category, ask the user.
- After creating all products, ask: "Do you want to add more products to this order?"`
}

// ─── Report Agent ────────────────────────────────────────────────────────────

export function getReportSystemPrompt(): string {
  const now = new Date();
  const todayIST = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `You are a business report generation assistant for Markit, a retail store management app.
You help store owners create professional PDF and Excel reports from their store data.

## Current Date
Today is ${todayIST} (IST). Use this to resolve relative dates like "today", "yesterday", "last week", "last 10 days", "this month", etc.

## Available Reports
- **sales** — Revenue, payment breakdown (Cash/UPI/Card/Credit), bill list, expenses, opening/closing balance
- **profit** — P&L with COGS, gross/net profit, margins per bill and per category
- **expense** — Expenses by category and payment mode with full details
- **stock** — Current inventory levels and value by category/brand
- **gst1** — GSTR-1 outward supplies: rate-wise summary, HSN-wise summary
- **distributor** — Purchase history, payments, credits, outstanding dues per distributor

## Workflow
1. Understand what the user wants — which report type?
2. Ask clarifying questions if needed:
   - **Format**: PDF or Excel? (PDF is best for viewing/printing, Excel for further analysis)
   - **Date range**: Which period? Default is current month.
   - If the request is clear enough, proceed without asking.
3. Call \`generate_report\` with the correct type, format, startDate, endDate
4. Share the download link and a brief summary of the key numbers

## Rules
- Never mention companyId — it is injected automatically.
- Currency is ₹ (INR).
- Date format: use ISO date strings (e.g. "2026-04-01") for tool calls.
- If the user asks for a report type that doesn't exist, suggest the closest match.
- If you need more data before deciding, use \`query_db\` to explore.
- Keep responses concise — the report itself has the details.`
}

export const REPORT_TOOL_NAMES = ['generate_report', 'query_db']

export const SETTING_TOOL_NAMES = [
  'get_settings',
  'update_store_identity',
  'update_store_policies',
  'update_billing_settings',
  'update_delivery_settings',
  'update_business_hours',
  'update_bank_details',
  'update_opening_balance',
  'update_store_address',
  'update_feature_toggles',
  'update_product_inputs',
  'update_variant_inputs',
  'update_printer_settings',
  'query_db',
]

export function getSettingSystemPrompt(): string {
  const now = new Date();
  const todayIST = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `You are a store settings assistant for Markit, a retail store management app.
You help store owners view and update their store settings through natural conversation.

## Current Date
Today is ${todayIST} (IST).

## Available Settings
You can read and update the following store settings:

- **Store Identity** — Store name, phone, logo, categories
- **Store Policies** — Description, thank you note, refund policy, return policy
- **Billing Settings** — Tax included, cost included, loyalty points value
- **Delivery Settings** — Delivery type/mode, fees, radius, waiting charges, discount thresholds
- **Business Hours** — Open time, close time
- **Bank Details** — Account holder name, IFSC, account number, bank name, UPI ID, GSTIN
- **Opening Balance** — Cash and bank opening balances
- **Store Address** — Street, landmark, city, state, pincode, coordinates
- **Feature Toggles** — AI image generation, user tracking
- **Product Input Fields** — Which fields are visible when adding products (name, brand, category, subcategory, description)
- **Variant Input Fields** — Which fields are visible for variants (name, code, prices, discount, qty, sizes, images, button)
- **Printer Settings** — Printer label size

## Workflow
1. If the user wants to view settings, call \`get_settings\` and present the relevant section clearly
2. If the user wants to update settings, confirm the changes and call the appropriate update tool
3. After updating, briefly confirm what was changed

## Rules
- Never mention companyId — it is injected automatically.
- Always confirm before making changes: "I'll update X to Y — shall I proceed?"
- For boolean fields, accept natural language ("turn on", "enable", "yes" → true; "turn off", "disable", "no" → false)
- If you need to look up data to answer a question, use \`query_db\`.
- Keep responses concise.`
}

// ─── Schema conversion helpers ────────────────────────────────────────────────

function toGeminiType(schema: Record<string, unknown>): Type {
  const t = schema.type
  if (Array.isArray(t)) {
    const nonNull = t.find((x: string) => x !== 'null')
    return toGeminiType({ ...schema, type: nonNull ?? 'string' })
  }
  switch (t) {
    case 'string': return Type.STRING
    case 'number': return Type.NUMBER
    case 'integer': return Type.INTEGER
    case 'boolean': return Type.BOOLEAN
    case 'array': return Type.ARRAY
    case 'object': return Type.OBJECT
    default: return Type.STRING
  }
}

function convertSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { type: toGeminiType(schema) }
  if (schema.description) result.description = schema.description
  if (schema.enum) result.enum = schema.enum
  if (schema.properties) {
    const props: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(schema.properties as Record<string, unknown>)) {
      props[key] = convertSchema(val as Record<string, unknown>)
    }
    result.properties = props
    if (schema.required) result.required = schema.required
  }
  if (schema.items) {
    result.items = convertSchema(schema.items as Record<string, unknown>)
  }
  return result
}

// ─── Build Gemini tool declarations from MCP ──────────────────────────────────


export async function getGeminiToolsAndClient(toolFilter?: string) {
  const mcpClient = await getMcpClient()
  let mcpTools = (await listMcpTools(mcpClient)) as McpToolDefinition[]

  // Filter tools for specialized agents
  if (toolFilter === 'report') {
    mcpTools = mcpTools.filter((t) => REPORT_TOOL_NAMES.includes(t.name))
  } else if (toolFilter === 'setting') {
    mcpTools = mcpTools.filter((t) => SETTING_TOOL_NAMES.includes(t.name))
  } else {
    // Default: exclude report-only and setting-only tools (they are on-demand via @report / @setting)
    // query_db is shared, so keep it in default mode
    const onDemandOnly = new Set([
      ...REPORT_TOOL_NAMES.filter(n => n !== 'query_db'),
      ...SETTING_TOOL_NAMES.filter(n => n !== 'query_db'),
    ])
    mcpTools = mcpTools.filter((t) => !onDemandOnly.has(t.name))
  }

  const geminiTools = mcpTools.map((tool) => {
    const schema = tool.inputSchema as {
      type: string
      properties?: Record<string, unknown>
      required?: string[]
    }
    const properties = { ...schema.properties }
    delete properties.companyId
    delete properties.userId
    delete properties.cleanup
    delete properties.isTaxIncluded
    const required = (schema.required ?? []).filter((k) => k !== 'companyId' && k !== 'userId' && k !== 'cleanup' && k !== 'isTaxIncluded')

    return {
      name: tool.name,
      description: tool.description ?? '',
      parameters: convertSchema({
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
      }),
    }
  })

  return { mcpClient, geminiTools }
}

// ─── Rebuild Gemini contents from chat history ────────────────────────────────

export function buildContentsFromHistory(messages: ChatMessage[]): Array<{ role: string; parts: any[] }> {
  const contents: Array<{ role: string; parts: any[] }> = []
  for (const m of messages) {
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content }] })
    } else {
      if (m.toolCalls?.length) {
        for (const tc of m.toolCalls) {
          contents.push({
            role: 'model',
            parts: [{ functionCall: { name: tc.tool, args: tc.args } }],
          })
          contents.push({
            role: 'user',
            parts: [{ functionResponse: { name: tc.tool, response: typeof tc.result === 'object' ? tc.result : { result: tc.result } } }],
          })
        }
      }
      contents.push({ role: 'model', parts: [{ text: m.content }] })
    }
  }
  return contents
}

export async function loadChatHistory(chatId: string, sessionStartedAt?: Date | null): Promise<ChatMessage[]> {
  const messages = await prisma.aiChatMessage.findMany({
    where: {
      chatId,
      ...(sessionStartedAt ? { createdAt: { gt: sessionStartedAt } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      content: true,
      toolCalls: true,
    },
  })

  return messages.map((message) => ({
    role: message.role as 'user' | 'assistant',
    content: message.content,
    toolCalls: message.toolCalls as unknown as ToolCallRecord[] | undefined,
  }))
}

// ─── Agentic loop (shared by text and voice) ──────────────────────────────────

async function loadUserMemories(companyId: string, userId: string): Promise<string> {
  const memories = await prisma.aiMemory.findMany({
    where: { companyId, userId },
    orderBy: { createdAt: 'desc' },
    take: 25,
  })
  if (!memories.length) return ''
  const lines = memories.map((m, i) => `${i + 1}. [${m.category ?? 'general'}] ${m.content}`)
  return `\n\n## User Memories & Preferences\nThese are things this user has asked you to remember. Follow these in all interactions:\n${lines.join('\n')}`
}

export async function runAgenticLoop(opts: {
  contents: Array<{ role: string; parts: any[] }>
  geminiTools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  mcpClient: any
  companyId: string
  userId: string
  model?: string
  systemPrompt?: string
  cleanup?: boolean
  isTaxIncluded?: boolean
}): Promise<{ reply: string; toolCalls: ToolCallRecord[] | undefined }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const genai = new GoogleGenAI({ apiKey })
  const { contents, geminiTools, mcpClient, companyId, userId } = opts
  const modelId = opts.model || 'gemini-3-flash-preview'
  const currentToolCalls: ToolCallRecord[] = []

  const memoryBlock = await loadUserMemories(companyId, userId)
  const systemPrompt = (opts.systemPrompt ?? getSystemPrompt()) + memoryBlock

  for (let i = 0; i < 8; i++) {
    const response = await genai.models.generateContent({
      model: modelId,
      contents,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: geminiTools }],
      },
    })

    const candidate = response.candidates?.[0]
    if (!candidate?.content?.parts?.length) break

    contents.push({ role: 'model', parts: candidate.content.parts as any })

    const functionCalls = candidate.content.parts.filter((p: any) => p.functionCall)

    if (!functionCalls.length) {
      const text = candidate.content.parts
        .filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join('\n')
      return {
        reply: text || 'No response generated.',
        toolCalls: currentToolCalls.length ? currentToolCalls : undefined,
      }
    }

    const functionResponses: any[] = []
    for (const part of functionCalls) {
      const fc = (part as any).functionCall
      const toolArgs = { ...(fc.args ?? {}) }
      let result: unknown
      try {
        const extraArgs: Record<string, unknown> = { companyId, userId }
        if (opts.cleanup !== undefined) extraArgs.cleanup = opts.cleanup
        if (opts.isTaxIncluded !== undefined) extraArgs.isTaxIncluded = opts.isTaxIncluded
        result = await callMcpTool(mcpClient, fc.name, { ...toolArgs, ...extraArgs })
      } catch (err: any) {
        result = { error: err.message }
      }

      // Upload report files to R2 so base64 doesn't bloat the context
      if (result && typeof result === 'object' && (result as any)._reportFile) {
        const r = result as { base64: string; filename: string; mimeType: string; summary: string }
        try {
          const ext = r.filename.endsWith('.xlsx') ? '.xlsx' : '.pdf'
          const key = `reports/${companyId}/${crypto.randomUUID()}${ext}`
          const url = await uploadToR2(r.base64, key, r.mimeType)
          result = { downloadUrl: url, filename: r.filename, summary: r.summary }
        } catch (uploadErr: any) {
          result = { error: `Report generated but upload failed: ${uploadErr.message}`, summary: r.summary }
        }
      }

      currentToolCalls.push({ tool: fc.name, args: toolArgs, result })
      functionResponses.push({
        functionResponse: {
          name: fc.name,
          response: typeof result === 'object' ? result : { result },
        },
      })
    }

    contents.push({ role: 'user' as any, parts: functionResponses })
  }

  const lastModel = contents.filter((c) => c.role === 'model').pop()
  const lastText = lastModel?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join('\n')
  return {
    reply: lastText || 'Something went wrong. Please try again.',
    toolCalls: currentToolCalls.length ? currentToolCalls : undefined,
  }
}

// ─── Persist messages to DB ───────────────────────────────────────────────────

async function persistMessagesWithOptions(opts: PersistMessagesOptions): Promise<string> {
  const now = new Date()
  let chatId = opts.chatId ?? undefined
  const updateData: Record<string, unknown> = { updatedAt: now }

  if (opts.title !== undefined) updateData.title = opts.title
  if (opts.channel !== undefined) updateData.channel = opts.channel
  if (opts.sourcePhone !== undefined) updateData.sourcePhone = opts.sourcePhone
  if (opts.sessionStatus !== undefined) updateData.sessionStatus = opts.sessionStatus
  if (opts.sessionStartedAt !== undefined) updateData.sessionStartedAt = opts.sessionStartedAt
  if (opts.lastSeenAt !== undefined) updateData.lastSeenAt = opts.lastSeenAt
  if (opts.expiresAt !== undefined) updateData.expiresAt = opts.expiresAt
  if (opts.companyId !== undefined) updateData.companyId = opts.companyId
  if (opts.userId !== undefined) updateData.userId = opts.userId

  if (!chatId) {
    const chat = await prisma.aiChat.create({
      data: {
        title: opts.title ?? (opts.userMessage ? opts.userMessage.slice(0, 80) : 'New Chat'),
        channel: opts.channel ?? 'WEB',
        sourcePhone: opts.sourcePhone ?? null,
        sessionStatus: opts.sessionStatus ?? 'ACTIVE',
        sessionStartedAt: opts.sessionStartedAt ?? null,
        lastSeenAt: opts.lastSeenAt ?? (opts.channel === 'WHATSAPP' ? now : null),
        expiresAt: opts.expiresAt ?? (opts.channel === 'WHATSAPP' ? new Date(now.getTime() + WHATSAPP_SESSION_TTL_MS) : null),
        companyId: opts.companyId ?? undefined,
        userId: opts.userId ?? undefined,
      },
    })
    chatId = chat.id
  } else {
    await prisma.aiChat.update({ where: { id: chatId }, data: updateData })
  }

  const messagesToCreate: Array<Record<string, unknown>> = []
  if (opts.userMessage !== undefined) {
    messagesToCreate.push({
      chatId,
      role: 'user',
      content: opts.userMessage,
      attachments: opts.attachments?.length ? opts.attachments : undefined,
    })
  }
  if (opts.assistantMessage !== undefined) {
    messagesToCreate.push({
      chatId,
      role: 'assistant',
      content: opts.assistantMessage,
      toolCalls: opts.toolCalls ?? undefined,
    })
  }

  if (messagesToCreate.length) {
    await prisma.aiChatMessage.createMany({ data: messagesToCreate as any })
  }

  return chatId
}

export async function persistMessages(
  chatIdOrOptions: string | PersistMessagesOptions | undefined,
  companyId?: string,
  userId?: string,
  userMessage?: string,
  reply?: string,
  toolCalls?: ToolCallRecord[] | undefined,
  attachments?: unknown[],
): Promise<string> {
  if (typeof chatIdOrOptions === 'object' && chatIdOrOptions !== null) {
    return persistMessagesWithOptions(chatIdOrOptions)
  }

  return persistMessagesWithOptions({
    chatId: chatIdOrOptions,
    companyId: companyId ?? null,
    userId: userId ?? null,
    userMessage,
    assistantMessage: reply,
    toolCalls,
    attachments,
    channel: 'WEB',
  })
}
