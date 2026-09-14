import { pool } from '~/server/db'
import { requireMarketingManager, segmentPredicate, segments } from '~/server/utils/ecommMarketing'

export default defineEventHandler(async (event) => {
  const companyId = await requireMarketingManager(event)
  const [campaigns, automations, jobs, counts, failedJobs] = await Promise.all([
    pool.query(`SELECT mc.id, mc.name, mc.subject, mc.body, mc.segment, mc.status,
        mc.scheduled_at AS "scheduledAt", mc.created_at AS "createdAt",
        COALESCE(j.sent, 0)::int AS "sentCount", COALESCE(j.failed, 0)::int AS "failedCount",
        COALESCE(j.pending, 0)::int AS "pendingCount"
      FROM ecomm_marketing_campaigns mc
      LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE status = 'SENT') AS sent,
        count(*) FILTER (WHERE status = 'FAILED') AS failed,
        count(*) FILTER (WHERE status IN ('PENDING','SENDING')) AS pending
        FROM ecomm_marketing_jobs WHERE campaign_id = mc.id AND company_id = mc.company_id) j ON true
      WHERE mc.company_id = $1 ORDER BY mc.created_at DESC LIMIT 100`, [companyId]),
    pool.query(`SELECT kind, enabled, delay_hours AS "delayHours", subject, body
      FROM ecomm_marketing_automations WHERE company_id = $1`, [companyId]),
    pool.query(`SELECT status, count(*)::int AS count FROM ecomm_marketing_jobs WHERE company_id = $1 GROUP BY status`, [companyId]),
    pool.query(`SELECT ${segments.map(s => `count(*) FILTER (WHERE ${segmentPredicate[s]})::int AS "${s}"`).join(', ')}
      FROM company_clients cc JOIN clients c ON c.id = cc.client_id
      WHERE cc.company_id = $1 AND cc.status = true AND c.email IS NOT NULL
      AND cc.marketing_opt_in_at IS NOT NULL AND lower(cc.marketing_opt_in_email) = lower(c.email)
      AND COALESCE(c.deleted, false) = false`, [companyId]),
    pool.query(`SELECT id, email, automation_kind AS "automationKind", event_key AS "eventKey",
      attempts, last_error AS "lastError", created_at AS "createdAt"
      FROM ecomm_marketing_jobs WHERE company_id = $1 AND status = 'FAILED'
      ORDER BY created_at DESC LIMIT 25`, [companyId]),
  ])
  return { campaigns: campaigns.rows, automations: automations.rows,
    jobCounts: jobs.rows, segmentCounts: counts.rows[0], failedJobs: failedJobs.rows }
})
