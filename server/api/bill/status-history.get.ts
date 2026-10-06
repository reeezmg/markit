import { createError, defineEventHandler, getQuery } from 'h3'
import { pool } from '~/server/db'
import { getReadCompanyIds } from '~/server/utils/organizationReadScope'

/** A shared reader for bill/order/check-out audit dates, including deleted records. */
export default defineEventHandler(async (event) => {
  const companyIds = await getReadCompanyIds(event)
  const query = getQuery(event)
  const tables = { bill: 'bills', order: 'ecomm_orders', checkout: 'ecomm_checkouts' } as const
  const type = query.type === undefined ? 'bill' : String(query.type)
  if (!Object.hasOwn(tables, type) || typeof query.id !== 'string' || !query.id.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Use id and type=bill|order|checkout' })
  }
  const table = tables[type as keyof typeof tables]
  // Table is from the fixed allowlist; IDs and tenant scope are always parameters.
  const document = await pool.query(
    `SELECT id, company_id AS "companyId", paid_at AS "paidAt"
     FROM ${table} WHERE id = $1 AND company_id = ANY($2::text[])`, [query.id, companyIds],
  )
  const history = await pool.query(
    `SELECT id, sequence::text AS sequence, company_id AS "companyId", field, previous_status AS "previousStatus",
            status, changed_at AS "changedAt", source, actor_id AS "actorId"
     FROM document_status_history
     WHERE entity_type = $1 AND entity_id = $2 AND company_id = ANY($3::text[])
     ORDER BY sequence`, [table, query.id, companyIds],
  )
  if (!document.rowCount && !history.rowCount) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  }
  return { document: document.rows[0] ?? null, history: history.rows }
})
