import { pool } from '~/server/db'

type RuntimeConfig = ReturnType<typeof useRuntimeConfig>

export const AI_USAGE_SOURCE_STOREFRONT_AGENT = 'storefront_agent'

let tableReady: Promise<void> | null = null

export function ensureAiUsageEventsTable() {
  if (!tableReady) {
    tableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_events (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        source TEXT NOT NULL DEFAULT 'storefront_agent',
        conversation_id TEXT,
        interaction_id TEXT NOT NULL,
        model TEXT,
        status TEXT,
        input_tokens BIGINT NOT NULL DEFAULT 0,
        output_tokens BIGINT NOT NULL DEFAULT 0,
        thoughts_tokens BIGINT NOT NULL DEFAULT 0,
        cached_tokens BIGINT NOT NULL DEFAULT 0,
        total_tokens BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (source, interaction_id)
      );
      CREATE INDEX IF NOT EXISTS ai_usage_events_company_created_idx
        ON ai_usage_events (company_id, created_at DESC);
    `).then(() => undefined)
  }
  return tableReady
}

function firstNumber(...values: any[]) {
  for (const value of values) {
    const parsed = typeof value === 'string' ? Number(value) : value
    if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return 0
}

/**
 * Field names confirmed against a real interaction response, which reports:
 *   total_tokens, total_input_tokens, total_output_tokens,
 *   total_thought_tokens, total_cached_tokens, total_tool_use_tokens
 * Thought tokens are counted separately from output (input + output + thought
 * summed exactly to total_tokens). Older generateContent spellings are kept as
 * fallbacks so a schema change degrades to zero rather than throwing.
 */
export function normalizeInteractionUsage(interaction: any) {
  const usage = interaction?.usage ?? interaction?.usage_metadata ?? interaction?.usageMetadata ?? {}

  const inputTokens = firstNumber(
    usage.total_input_tokens, usage.totalInputTokens,
    usage.input_tokens, usage.inputTokens,
    usage.prompt_token_count, usage.promptTokenCount,
  )
  const outputTokens = firstNumber(
    usage.total_output_tokens, usage.totalOutputTokens,
    usage.output_tokens, usage.outputTokens,
    usage.candidates_token_count, usage.candidatesTokenCount,
  )
  const thoughtsTokens = firstNumber(
    usage.total_thought_tokens, usage.totalThoughtTokens,
    usage.thoughts_token_count, usage.thoughtsTokenCount,
    usage.reasoning_tokens, usage.reasoningTokens,
  )
  const cachedTokens = firstNumber(
    usage.total_cached_tokens, usage.totalCachedTokens,
    usage.cached_content_token_count, usage.cachedContentTokenCount,
    usage.cached_tokens, usage.cachedTokens,
  )
  const toolUseTokens = firstNumber(
    usage.total_tool_use_tokens, usage.totalToolUseTokens,
  )
  const reportedTotal = firstNumber(
    usage.total_tokens, usage.totalTokens,
    usage.total_token_count, usage.totalTokenCount,
  )

  return {
    inputTokens,
    outputTokens,
    thoughtsTokens,
    cachedTokens,
    toolUseTokens,
    totalTokens: reportedTotal || inputTokens + outputTokens + thoughtsTokens + toolUseTokens,
  }
}

export type NormalizedUsage = ReturnType<typeof normalizeInteractionUsage>

export function aiUsageRates(runtime: RuntimeConfig) {
  const config = (runtime as any).aiUsage || {}
  return {
    inputUsdPerMillion: Number(config.storefrontInputUsdPerMillion) || 0,
    outputUsdPerMillion: Number(config.storefrontOutputUsdPerMillion) || 0,
    cachedInputMultiplier: Number(config.cachedInputMultiplier) || 0.25,
    usdToInr: Number(config.usdToInr) || 0,
    multiplier: Number(config.costMultiplier) || 1,
  }
}

export function priceUsage(usage: {
  inputTokens: number
  outputTokens: number
  thoughtsTokens: number
  cachedTokens?: number
  totalTokens: number
}, rates: ReturnType<typeof aiUsageRates>) {
  // Thought tokens are reported separately from output but billed at the output
  // rate. The total-minus-input guard keeps this correct if that ever changes.
  const billableOutput = Math.max(usage.outputTokens + usage.thoughtsTokens, usage.totalTokens - usage.inputTokens, 0)

  // Cached input is a subset of input tokens and is billed at a discount.
  const cached = Math.min(usage.cachedTokens || 0, usage.inputTokens)
  const freshInput = Math.max(usage.inputTokens - cached, 0)

  const costUsd =
    (freshInput / 1_000_000) * rates.inputUsdPerMillion +
    (cached / 1_000_000) * rates.inputUsdPerMillion * rates.cachedInputMultiplier +
    (billableOutput / 1_000_000) * rates.outputUsdPerMillion
  const baseInr = costUsd * rates.usdToInr

  return {
    billableOutput,
    costUsd,
    baseInr,
    billedInr: baseInr * rates.multiplier,
  }
}

export async function recordAiUsageEvent(args: {
  companyId: string
  source: string
  conversationId: string | null
  interactionId: string
  model: string | null
  status: string | null
  usage: NormalizedUsage
}) {
  if (!args.usage.totalTokens) return
  await ensureAiUsageEventsTable()
  await pool.query(
    `INSERT INTO ai_usage_events
       (company_id, source, conversation_id, interaction_id, model, status,
        input_tokens, output_tokens, thoughts_tokens, cached_tokens, total_tokens, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     ON CONFLICT (source, interaction_id) DO UPDATE
     SET status = EXCLUDED.status,
         model = COALESCE(EXCLUDED.model, ai_usage_events.model),
         input_tokens = EXCLUDED.input_tokens,
         output_tokens = EXCLUDED.output_tokens,
         thoughts_tokens = EXCLUDED.thoughts_tokens,
         cached_tokens = EXCLUDED.cached_tokens,
         total_tokens = EXCLUDED.total_tokens,
         updated_at = NOW()`,
    [
      args.companyId,
      args.source,
      args.conversationId,
      args.interactionId,
      args.model,
      args.status,
      args.usage.inputTokens,
      args.usage.outputTokens,
      args.usage.thoughtsTokens,
      args.usage.cachedTokens,
      args.usage.totalTokens,
    ],
  )
}

export async function getAiUsageSummary(args: {
  runtime: RuntimeConfig
  companyId: string
  days: number | null
}) {
  await ensureAiUsageEventsTable()
  const rates = aiUsageRates(args.runtime)
  const windowClause = args.days ? `AND created_at >= NOW() - ($2 || ' days')::interval` : ''
  const params: any[] = args.days ? [args.companyId, String(args.days)] : [args.companyId]

  const totals = await pool.query<{
    runs: string
    inputTokens: string
    outputTokens: string
    thoughtsTokens: string
    cachedTokens: string
    totalTokens: string
  }>(
    `SELECT COUNT(*)::text AS runs,
            COALESCE(SUM(input_tokens), 0)::text AS "inputTokens",
            COALESCE(SUM(output_tokens), 0)::text AS "outputTokens",
            COALESCE(SUM(thoughts_tokens), 0)::text AS "thoughtsTokens",
            COALESCE(SUM(cached_tokens), 0)::text AS "cachedTokens",
            COALESCE(SUM(total_tokens), 0)::text AS "totalTokens"
     FROM ai_usage_events
     WHERE company_id = $1 ${windowClause}`,
    params,
  )

  type DailyRow = {
    day: string
    runs: string
    inputTokens: string
    outputTokens: string
    thoughtsTokens: string
    cachedTokens: string
    totalTokens: string
  }
  const daily = await pool.query<DailyRow>(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
            COUNT(*)::text AS runs,
            COALESCE(SUM(input_tokens), 0)::text AS "inputTokens",
            COALESCE(SUM(output_tokens), 0)::text AS "outputTokens",
            COALESCE(SUM(thoughts_tokens), 0)::text AS "thoughtsTokens",
            COALESCE(SUM(cached_tokens), 0)::text AS "cachedTokens",
            COALESCE(SUM(total_tokens), 0)::text AS "totalTokens"
     FROM ai_usage_events
     WHERE company_id = $1 ${windowClause}
     GROUP BY 1
     ORDER BY 1 DESC`,
    params,
  )

  type RecentRow = {
    interactionId: string
    conversationId: string | null
    title: string | null
    status: string | null
    model: string | null
    inputTokens: string
    outputTokens: string
    thoughtsTokens: string
    cachedTokens: string
    totalTokens: string
    createdAt: string
  }
  const recent = await pool.query<RecentRow>(
    `SELECT e.interaction_id AS "interactionId", e.conversation_id AS "conversationId",
            s.title, e.status, e.model,
            e.input_tokens::text AS "inputTokens", e.output_tokens::text AS "outputTokens",
            e.thoughts_tokens::text AS "thoughtsTokens", e.cached_tokens::text AS "cachedTokens",
            e.total_tokens::text AS "totalTokens",
            e.created_at AS "createdAt"
     FROM ai_usage_events e
     LEFT JOIN storefront_agent_sessions s
       ON s.company_id = e.company_id AND s.conversation_id = e.conversation_id
     WHERE e.company_id = $1 ${windowClause.replace(/created_at/g, 'e.created_at')}
     ORDER BY e.created_at DESC
     LIMIT 50`,
    params,
  )

  const row = totals.rows[0]
  const summed = {
    inputTokens: Number(row?.inputTokens || 0),
    outputTokens: Number(row?.outputTokens || 0),
    thoughtsTokens: Number(row?.thoughtsTokens || 0),
    cachedTokens: Number(row?.cachedTokens || 0),
    totalTokens: Number(row?.totalTokens || 0),
  }
  const cost = priceUsage(summed, rates)

  return {
    rates: {
      inputUsdPerMillion: rates.inputUsdPerMillion,
      outputUsdPerMillion: rates.outputUsdPerMillion,
      usdToInr: rates.usdToInr,
      multiplier: rates.multiplier,
      configured: rates.inputUsdPerMillion > 0 && rates.usdToInr > 0,
    },
    totals: {
      runs: Number(row?.runs || 0),
      ...summed,
      costUsd: cost.costUsd,
      baseInr: cost.baseInr,
      billedInr: cost.billedInr,
    },
    daily: daily.rows.map((entry: DailyRow) => {
      const usage = {
        inputTokens: Number(entry.inputTokens),
        outputTokens: Number(entry.outputTokens),
        thoughtsTokens: Number(entry.thoughtsTokens),
        cachedTokens: Number(entry.cachedTokens),
        totalTokens: Number(entry.totalTokens),
      }
      return {
        day: entry.day,
        runs: Number(entry.runs),
        ...usage,
        billedInr: priceUsage(usage, rates).billedInr,
      }
    }),
    recent: recent.rows.map((entry: RecentRow) => {
      const usage = {
        inputTokens: Number(entry.inputTokens),
        outputTokens: Number(entry.outputTokens),
        thoughtsTokens: Number(entry.thoughtsTokens),
        cachedTokens: Number(entry.cachedTokens),
        totalTokens: Number(entry.totalTokens),
      }
      return {
        interactionId: entry.interactionId,
        conversationId: entry.conversationId,
        title: entry.title,
        status: entry.status,
        model: entry.model,
        createdAt: entry.createdAt,
        ...usage,
        billedInr: priceUsage(usage, rates).billedInr,
      }
    }),
  }
}
