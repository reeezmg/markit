import { createError, defineEventHandler, getQuery } from 'h3'
import { gatherSummary } from '~/server/utils/reportSummary'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (session.data.type !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  const query = getQuery(event)

  return gatherSummary({
    companyId,
    from: (query.from as string | undefined) ?? null,
    to: (query.to as string | undefined) ?? null,
    cleanup: session.data.cleanup ?? false,
  })
})
