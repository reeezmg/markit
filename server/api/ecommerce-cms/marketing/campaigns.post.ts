import { createError, readBody } from 'h3'
import { isSegment, marketingTransaction, recordMarketingAudit, requireMarketingManager } from '~/server/utils/ecommMarketing'

export default defineEventHandler(async (event) => {
  const companyId = await requireMarketingManager(event)
  const body = await readBody<{ name?: string; subject?: string; body?: string; segment?: string; scheduledAt?: string }>(event)
  const name = String(body.name || '').trim()
  const subject = String(body.subject || '').trim()
  const content = String(body.body || '').trim()
  if (!name || name.length > 100 || !subject || subject.length > 180 || /[\r\n]/.test(subject)
    || !content || content.length > 10000 || !isSegment(body.segment)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid campaign name, subject, message or segment' })
  }
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null
  if (scheduledAt && (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now())) {
    throw createError({ statusCode: 400, statusMessage: 'Schedule must be in the future' })
  }
  const session = await useAuthSession(event)
  return marketingTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO ecomm_marketing_campaigns (company_id, name, subject, body, segment, scheduled_at)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [companyId, name, subject, content, body.segment, scheduledAt],
    )
    await recordMarketingAudit(companyId, String(session.data.id), 'campaign_created', rows[0].id, client)
    return { id: rows[0].id }
  })
})
