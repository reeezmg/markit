import { defineEventHandler, readBody, createError } from 'h3'
import Anthropic from '@anthropic-ai/sdk'
import { getMcpClient, listMcpTools, callMcpTool } from '~/server/utils/mcpClient'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `You are a helpful business assistant for a retail store management app called Markit.
You have access to the store's product and purchase order data via tools.

## Product Creation Flow (IMPORTANT — always follow this order)
When the user wants to add/create a product:
1. First call create_purchase_order to get a purchaseOrderId (ask for distributor/bill info — all optional).
2. Use that purchaseOrderId when calling create_product.
3. After creating the product, always ask: "Product added! Do you want to add more products to this same order?"
4. If YES → call create_product again using the SAME purchaseOrderId (do NOT create a new PO).
5. If NO → respond "Order complete!" and stop.
6. If the user wants a new order → go back to step 1.

Never mention companyId to the user — it is handled automatically.`

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = await readBody<{ messages: ChatMessage[] }>(event)
  if (!body?.messages?.length) {
    throw createError({ statusCode: 400, statusMessage: 'messages is required' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'ANTHROPIC_API_KEY not configured' })
  }

  // ─── Connect to MCP server and get tools ────────────────────────────────────
  const mcpClient = await getMcpClient()
  const mcpTools = await listMcpTools(mcpClient)

  // Convert MCP tool list → Anthropic tool format
  // Hide companyId from Claude — the bridge injects it
  const anthropicTools: Anthropic.Tool[] = mcpTools.map((tool) => {
    const schema = tool.inputSchema as {
      type: string
      properties?: Record<string, unknown>
      required?: string[]
    }
    const properties = { ...schema.properties }
    delete properties.companyId
    const required = (schema.required ?? []).filter((k) => k !== 'companyId')

    return {
      name: tool.name,
      description: tool.description ?? '',
      input_schema: {
        type: 'object' as const,
        properties,
        ...(required.length ? { required } : {}),
      },
    }
  })

  // ─── Build conversation ──────────────────────────────────────────────────────
  const claude = new Anthropic({ apiKey })

  const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  // ─── Agentic loop ────────────────────────────────────────────────────────────
  for (let i = 0; i < 8; i++) {
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: anthropicTools,
      messages,
    })

    // Add Claude's response to conversation
    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'end_turn') {
      // Extract text reply
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      return { reply: text }
    }

    if (response.stop_reason !== 'tool_use') break

    // Handle tool calls — inject companyId before forwarding to MCP server
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    )

    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUseBlocks) {
      let result: unknown
      try {
        result = await callMcpTool(mcpClient, toolUse.name, {
          ...(toolUse.input as Record<string, unknown>),
          companyId, // always inject from session
        })
      } catch (err: any) {
        result = { error: err.message }
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      })
    }

    messages.push({ role: 'user', content: toolResults })
  }

  return { reply: 'Something went wrong. Please try again.' }
})
