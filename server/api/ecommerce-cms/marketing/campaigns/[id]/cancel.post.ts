import { createError, getRouterParam } from 'h3'
import { marketingTransaction, recordMarketingAudit, requireMarketingManager } from '~/server/utils/ecommMarketing'

export default defineEventHandler(async (event) => {
  const companyId = await requireMarketingManager(event)
  const id = getRouterParam(event, 'id')
  const session = await useAuthSession(event)
  return marketingTransaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE ecomm_marketing_campaigns SET status = 'CANCELLED', updated_at = now()
        WHERE id = $1 AND company_id = $2 AND status IN ('DRAFT','QUEUED','ENQUEUED')`, [id, companyId],
    )
    if (!rowCount) throw createError({ statusCode: 409, statusMessage: 'Campaign cannot be cancelled' })
    await client.query(`UPDATE ecomm_marketing_jobs SET status = 'CANCELLED'
      WHERE company_id = $1 AND campaign_id = $2 AND status IN ('PENDING','FAILED')`, [companyId, id])
    await recordMarketingAudit(companyId, String(session.data.id), 'campaign_cancelled', String(id), client)
    return { cancelled: true }
  })
})
