import { defineEventHandler, createError, getQuery } from 'h3'
import { getAiUsageSummary } from '~/server/utils/aiUsage'
import { ensureStorefrontAgentSessionsTable } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const query = getQuery(event)
  const rawDays = Array.isArray(query.days) ? query.days[0] : query.days
  const days = rawDays === 'all' ? null : Math.min(Math.max(Number(rawDays) || 30, 1), 365)

  // The usage summary LEFT JOINs the agent session table for chat titles, which
  // only exists once the storefront agent has run at least once.
  await ensureStorefrontAgentSessionsTable()

  return await getAiUsageSummary({
    runtime: useRuntimeConfig(),
    companyId,
    days,
  })
})
