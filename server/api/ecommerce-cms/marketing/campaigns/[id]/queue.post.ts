import { createError, getRouterParam } from 'h3'
import { marketingTransaction, recordMarketingAudit, requireMarketingManager } from '~/server/utils/ecommMarketing'

export default defineEventHandler(async (event) => {
  const companyId = await requireMarketingManager(event)
  const id = getRouterParam(event, 'id')
  const session = await useAuthSession(event)
  return marketingTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE ecomm_marketing_campaigns SET status = 'QUEUED', updated_at = now(),
        scheduled_at = COALESCE(scheduled_at, now())
        WHERE id = $1 AND company_id = $2 AND status = 'DRAFT' RETURNING id`, [id, companyId],
    )
    if (!rows.length) throw createError({ statusCode: 409, statusMessage: 'Campaign is not a draft' })
    await recordMarketingAudit(companyId, String(session.data.id), 'campaign_queued', String(id), client)
    return { queued: true }
  })
})
