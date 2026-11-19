import { createError, defineEventHandler, readBody } from 'h3'
import { pool } from '~/server/db'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { carrierScheduleInput, requirePickupScheduleSchema } from '~/server/utils/pickup-management'

export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const body = await readBody(event)
  if (typeof body?.requestId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Pickup is required' })
  const schedule = carrierScheduleInput(body)
  await requirePickupScheduleSchema(pool)
  const result = await pool.query(`UPDATE ecomm_pickup_requests SET carrier_schedule=$3::jsonb,updated_at=now()
    WHERE company_id=$1 AND id=$2 AND carrier_pickup_id IS NOT NULL AND status='REQUESTED' RETURNING id`,
    [companyId, body.requestId, JSON.stringify(schedule)])
  if (!result.rows.length) throw createError({ statusCode: 404, statusMessage: 'Open carrier pickup not found' })
  return { ok: true, carrierSchedule: schedule }
})
