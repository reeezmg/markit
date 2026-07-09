import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

// List dimension presets (packaging boxes + product dimension presets) for the
// company. Optional ?type=box|product filter. Reads shipping_boxes directly so
// no ZenStack regen/restart is needed for the `type` discriminator.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { type } = getQuery(event) as { type?: string }
  const params: any[] = [companyId]
  let filter = ''
  if (type === 'box' || type === 'product') {
    params.push(type)
    filter = ' AND type = $2'
  }

  const { rows } = await pool.query(
    `SELECT id, name, type, weight, length, width, height, status, created_at AS "createdAt"
     FROM shipping_boxes
     WHERE company_id = $1${filter}
     ORDER BY created_at DESC`,
    params,
  )
  return { dimensions: rows }
})
