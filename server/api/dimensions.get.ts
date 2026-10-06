import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'
import { getReadCompanyIds } from '~/server/utils/organizationReadScope'

// List dimension presets (packaging boxes + product dimension presets) for the
// company. Optional ?type=box|product filter. Reads shipping_boxes directly so
// no ZenStack regen/restart is needed for the `type` discriminator.
export default defineEventHandler(async (event) => {
  const companyIds = await getReadCompanyIds(event)

  const { type } = getQuery(event) as { type?: string }
  const params: any[] = [companyIds]
  let filter = ''
  if (type === 'box' || type === 'product') {
    params.push(type)
    filter = ' AND sb.type = $2'
  }

  const { rows } = await pool.query(
    `SELECT sb.id, sb.name, sb.type, sb.weight, sb.length, sb.width, sb.height, sb.status,
            sb.company_id AS "companyId", co.name AS "companyName", sb.created_at AS "createdAt"
     FROM shipping_boxes sb
     JOIN companies co ON co.id = sb.company_id
     WHERE sb.company_id = ANY($1::text[])${filter}
     ORDER BY sb.created_at DESC`,
    params,
  )
  return { dimensions: rows }
})
