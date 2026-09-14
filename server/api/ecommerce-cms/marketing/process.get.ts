import { createError, getHeader } from 'h3'
import { pool } from '~/server/db'
import { renderMarketingBody, segmentPredicate, sendMarketingEmail, unsubscribeToken, type Segment } from '~/server/utils/ecommMarketing'

export default defineEventHandler(async (event) => {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16 || getHeader(event, 'authorization') !== `Bearer ${secret}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const baseUrl = process.env.MARKETING_PUBLIC_BASE_URL?.replace(/\/$/, '')
  if (!baseUrl || (!baseUrl.startsWith('https://') && !baseUrl.startsWith('http://localhost'))) {
    throw createError({ statusCode: 503, statusMessage: 'MARKETING_PUBLIC_BASE_URL is not configured' })
  }

  const lockClient = await pool.connect()
  let locked = false
  try {
    const lock = await lockClient.query('SELECT pg_try_advisory_lock(95831746) AS acquired')
    locked = !!lock.rows[0]?.acquired
    if (!locked) return { skipped: true, reason: 'Processor already running' }

  // Bound each invocation for serverless execution. Repeated cron runs drain the queue.
  const dueCampaigns = await pool.query(`SELECT id, company_id, subject, body, segment
    FROM ecomm_marketing_campaigns WHERE status = 'QUEUED' AND scheduled_at <= now()
    ORDER BY scheduled_at ASC LIMIT 5`)
  for (const campaign of dueCampaigns.rows) {
    const predicate = segmentPredicate[campaign.segment as Segment]
    if (!predicate) continue
    const inserted = await pool.query(`INSERT INTO ecomm_marketing_jobs
      (company_id, client_id, campaign_id, event_key, email, subject, body)
      SELECT cc.company_id, cc.client_id, $2, 'campaign:' || $2, c.email, $3, $4
      FROM company_clients cc JOIN clients c ON c.id = cc.client_id
      WHERE cc.company_id = $1 AND cc.status = true AND COALESCE(c.deleted, false) = false
        AND cc.marketing_opt_in_at IS NOT NULL AND lower(cc.marketing_opt_in_email) = lower(c.email)
        AND c.email IS NOT NULL AND ${predicate}
        AND NOT EXISTS (SELECT 1 FROM ecomm_marketing_jobs j
          WHERE j.company_id = cc.company_id AND j.client_id = cc.client_id AND j.event_key = 'campaign:' || $2)
      ORDER BY cc.client_id LIMIT 200
      ON CONFLICT (company_id, event_key, client_id) DO NOTHING`,
      [campaign.company_id, campaign.id, campaign.subject, campaign.body])
    if ((inserted.rowCount || 0) < 200) await pool.query(`UPDATE ecomm_marketing_campaigns SET status = 'ENQUEUED', updated_at = now()
      WHERE id = $1 AND status = 'QUEUED'`, [campaign.id])
  }

  const automations = await pool.query(`SELECT company_id, kind, delay_hours, subject, body, updated_at
    FROM ecomm_marketing_automations WHERE enabled = true ORDER BY company_id, kind`)
  for (const rule of automations.rows) {
    if (rule.kind === 'abandoned_cart') {
      await pool.query(`INSERT INTO ecomm_marketing_jobs
        (company_id, client_id, automation_kind, event_key, email, subject, body)
        SELECT cc.company_id, cc.client_id, 'abandoned_cart',
          'cart:' || ec.updated_at::text, c.email, $3, $4
        FROM ecomm_carts ec
        JOIN company_clients cc ON cc.company_id = ec.company_id AND cc.client_id = ec.client_id
        JOIN clients c ON c.id = cc.client_id
        WHERE cc.company_id = $1 AND cc.status = true AND cc.marketing_opt_in_at IS NOT NULL
          AND lower(cc.marketing_opt_in_email) = lower(c.email)
          AND COALESCE(c.deleted, false) = false AND c.email IS NOT NULL
          AND ec.items::jsonb <> '[]'::jsonb
          AND ec.updated_at <= now() - ($2::int * interval '1 hour')
          AND ec.updated_at > now() - interval '7 days'
          AND ec.updated_at >= $5
          AND NOT EXISTS (SELECT 1 FROM ecomm_orders o WHERE o.company_id = cc.company_id
            AND o.client_id = cc.client_id AND o.created_at > ec.updated_at AND o.status <> 'CANCELLED')
          AND NOT EXISTS (SELECT 1 FROM ecomm_marketing_jobs j WHERE j.company_id = cc.company_id
            AND j.client_id = cc.client_id AND j.event_key = 'cart:' || ec.updated_at::text)
          AND NOT EXISTS (SELECT 1 FROM ecomm_marketing_jobs recent WHERE recent.company_id = cc.company_id
            AND recent.client_id = cc.client_id AND recent.automation_kind = 'abandoned_cart'
            AND recent.sent_at > now() - interval '7 days')
        ORDER BY ec.updated_at DESC LIMIT 100
        ON CONFLICT (company_id, event_key, client_id) DO NOTHING`,
        [rule.company_id, rule.delay_hours, rule.subject, rule.body, rule.updated_at])
    } else if (rule.kind === 'post_purchase') {
      await pool.query(`INSERT INTO ecomm_marketing_jobs
        (company_id, client_id, automation_kind, event_key, email, subject, body)
        SELECT cc.company_id, cc.client_id, 'post_purchase',
          'order:' || o.id, c.email, $3, $4
        FROM ecomm_orders o
        JOIN company_clients cc ON cc.company_id = o.company_id AND cc.client_id = o.client_id
        JOIN clients c ON c.id = cc.client_id
        WHERE cc.company_id = $1 AND cc.status = true AND cc.marketing_opt_in_at IS NOT NULL
          AND lower(cc.marketing_opt_in_email) = lower(c.email)
          AND COALESCE(c.deleted, false) = false AND c.email IS NOT NULL
          AND o.status NOT IN ('CANCELLED','RETURNED')
          AND o.created_at <= now() - ($2::int * interval '1 hour')
          AND o.created_at > now() - interval '30 days'
          AND o.created_at >= $5
          AND NOT EXISTS (SELECT 1 FROM ecomm_marketing_jobs j WHERE j.company_id = cc.company_id
            AND j.client_id = cc.client_id AND j.event_key = 'order:' || o.id)
        ORDER BY o.created_at DESC LIMIT 100
        ON CONFLICT (company_id, event_key, client_id) DO NOTHING`,
        [rule.company_id, rule.delay_hours, rule.subject, rule.body, rule.updated_at])
    }
  }

  let sent = 0
  let failed = 0
  for (let i = 0; i < 5; i++) {
    const claim = await pool.query(`UPDATE ecomm_marketing_jobs j SET status = 'SENDING',
        claimed_at = now(), attempts = attempts + 1
      WHERE j.id = (SELECT id FROM ecomm_marketing_jobs WHERE
        (status = 'PENDING' OR (status = 'SENDING' AND claimed_at < now() - interval '15 minutes'))
        AND next_attempt_at <= now() ORDER BY next_attempt_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING j.*`)
    const job = claim.rows[0]
    if (!job) break
    try {
      const { rows } = await pool.query(`SELECT c.name, c.email, cc.marketing_opt_in_at, cc.marketing_opt_in_email,
          cc.status AS client_status, c.deleted,
          mc.status AS campaign_status, ma.enabled AS automation_enabled,
          ('cart:' || ec.updated_at::text) AS cart_event_key, ec.items AS cart_items,
          EXISTS (SELECT 1 FROM ecomm_orders recent WHERE recent.company_id = cc.company_id
            AND recent.client_id = cc.client_id AND recent.created_at > ec.updated_at
            AND recent.status <> 'CANCELLED') AS purchased_after_cart,
          eo.status AS order_status
        FROM company_clients cc JOIN clients c ON c.id = cc.client_id
        LEFT JOIN ecomm_marketing_campaigns mc ON mc.id = $3 AND mc.company_id = cc.company_id
        LEFT JOIN ecomm_marketing_automations ma ON ma.company_id = cc.company_id AND ma.kind = $4
        LEFT JOIN ecomm_carts ec ON ec.company_id = cc.company_id AND ec.client_id = cc.client_id
        LEFT JOIN ecomm_orders eo ON eo.company_id = cc.company_id AND eo.id = split_part($5, ':', 2)
        WHERE cc.company_id = $1 AND cc.client_id = $2`,
        [job.company_id, job.client_id, job.campaign_id, job.automation_kind, job.event_key])
      const current = rows[0]
      const cartCurrent = job.automation_kind !== 'abandoned_cart' || (current?.cart_event_key &&
        current.cart_event_key === job.event_key &&
        Array.isArray(current.cart_items) && current.cart_items.length > 0 && !current.purchased_after_cart)
      const orderCurrent = job.automation_kind !== 'post_purchase' || (current?.order_status && !['CANCELLED', 'RETURNED'].includes(current.order_status))
      const allowed = current && current.marketing_opt_in_at && current.marketing_opt_in_email?.toLowerCase() === current.email?.toLowerCase()
        && current.client_status && !current.deleted
        && current.email === job.email && (!job.campaign_id || ['QUEUED', 'ENQUEUED'].includes(current.campaign_status))
        && (!job.automation_kind || current.automation_enabled) && cartCurrent && orderCurrent
      if (!allowed) {
        await pool.query(`UPDATE ecomm_marketing_jobs SET status = 'CANCELLED' WHERE id = $1`, [job.id])
        continue
      }
      const recent = await pool.query(`SELECT max(sent_at) AS last_sent FROM ecomm_marketing_jobs
        WHERE company_id = $1 AND client_id = $2 AND status = 'SENT' AND id <> $3`,
        [job.company_id, job.client_id, job.id])
      if (recent.rows[0]?.last_sent && Date.now() - new Date(recent.rows[0].last_sent).getTime() < 24 * 3600 * 1000) {
        await pool.query(`UPDATE ecomm_marketing_jobs SET status = 'PENDING', attempts = attempts - 1,
          next_attempt_at = $2::timestamptz + interval '24 hours' WHERE id = $1`, [job.id, recent.rows[0].last_sent])
        continue
      }
      const token = unsubscribeToken(job.company_id, job.client_id)
      const url = `${baseUrl}/api/marketing/unsubscribe?company=${encodeURIComponent(job.company_id)}&client=${encodeURIComponent(job.client_id)}&token=${token}`
      await sendMarketingEmail(job.email, job.subject, renderMarketingBody(job.body, current.name), url)
      await pool.query(`UPDATE ecomm_marketing_jobs SET status = 'SENT', sent_at = now(), last_error = NULL WHERE id = $1`, [job.id])
      sent++
    } catch (error: any) {
      await pool.query(`UPDATE ecomm_marketing_jobs SET status = CASE WHEN attempts >= 3 THEN 'FAILED' ELSE 'PENDING' END,
        next_attempt_at = now() + (power(2, attempts) * interval '15 minutes'),
        last_error = left($2, 500) WHERE id = $1`, [job.id, String(error?.message || error)])
      failed++
    }
  }
    await pool.query(`UPDATE ecomm_marketing_campaigns mc SET status = 'COMPLETE', updated_at = now()
      WHERE status = 'ENQUEUED' AND NOT EXISTS (SELECT 1 FROM ecomm_marketing_jobs j
        WHERE j.campaign_id = mc.id AND j.status IN ('PENDING','SENDING'))`)
    return { sent, failed }
  } finally {
    try { if (locked) await lockClient.query('SELECT pg_advisory_unlock(95831746)') }
    finally { lockClient.release() }
  }
})
