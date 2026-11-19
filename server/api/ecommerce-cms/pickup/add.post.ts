import { createError, defineEventHandler, readBody } from 'h3'
import { pool } from '~/server/db'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { addPickupShipments } from '~/server/utils/pickup-management'

export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const body = await readBody(event)
  if (typeof body?.requestId !== 'string' || !Array.isArray(body.shipmentIds) || body.shipmentIds.some((id: unknown) => typeof id !== 'string')) {
    throw createError({ statusCode: 400, statusMessage: 'Pickup and parcel selection are required' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await addPickupShipments(client, companyId, body.requestId, body.shipmentIds)
    await client.query('COMMIT')
    return { ok: true, ...result, carrierUpdated: false }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
})
