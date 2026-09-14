import { createError, readBody } from 'h3'
import { marketingTransaction, recordMarketingAudit, requireMarketingManager } from '~/server/utils/ecommMarketing'

export default defineEventHandler(async (event) => {
  const companyId = await requireMarketingManager(event)
  const body = await readBody<{ kind?: string; enabled?: boolean; delayHours?: number; subject?: string; body?: string }>(event)
  const kind = body.kind
  const hours = Number(body.delayHours)
  const subject = String(body.subject || '').trim()
  const content = String(body.body || '').trim()
  if (!['abandoned_cart', 'post_purchase'].includes(kind || '') || typeof body.enabled !== 'boolean'
    || !Number.isInteger(hours) || hours < 1 || hours > 720 || !subject || subject.length > 180 || /[\r\n]/.test(subject)
    || !content || content.length > 10000) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid automation configuration' })
  }
  const session = await useAuthSession(event)
  return marketingTransaction(async (client) => {
    await client.query(`INSERT INTO ecomm_marketing_automations
        (company_id, kind, enabled, delay_hours, subject, body)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (company_id, kind) DO UPDATE SET enabled = EXCLUDED.enabled,
          delay_hours = EXCLUDED.delay_hours, subject = EXCLUDED.subject,
          body = EXCLUDED.body, updated_at = now()`,
      [companyId, kind, body.enabled, hours, subject, content])
    if (!body.enabled) await client.query(`UPDATE ecomm_marketing_jobs SET status = 'CANCELLED'
      WHERE company_id = $1 AND automation_kind = $2 AND status IN ('PENDING','FAILED')`, [companyId, kind])
    await recordMarketingAudit(companyId, String(session.data.id), body.enabled ? 'automation_enabled_or_updated' : 'automation_disabled', kind, client)
    return { saved: true }
  })
})
