import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

// Custom product/variant input definitions for the current company.
// Query: ?scope=PRODUCT|VARIANT   ?activeOnly=true
// Returns { fields: [...], migrationPending?: true }
//
// `migrationPending` is returned instead of throwing when the table does not
// exist yet (Postgres 42P01) so the product forms keep working before the
// migration has been applied.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const query = getQuery(event)
  const scope = String(query.scope || '')
  const activeOnly = query.activeOnly === 'true' || query.activeOnly === '1'

  const params: any[] = [companyId]
  let sql = `SELECT id, scope, key, label, type, options, required, active, sort_order
             FROM product_custom_fields
             WHERE company_id = $1`
  if (scope === 'PRODUCT' || scope === 'VARIANT') {
    params.push(scope)
    sql += ` AND scope = $${params.length}`
  }
  if (activeOnly) sql += ` AND active = true`
  sql += ` ORDER BY scope ASC, sort_order ASC, created_at ASC`

  try {
    const { rows } = await pool.query(sql, params)
    return {
      fields: rows.map((r) => ({
        id: r.id,
        scope: r.scope,
        key: r.key,
        label: r.label,
        type: r.type,
        options: r.options || [],
        required: r.required,
        active: r.active,
        sortOrder: r.sort_order,
      })),
    }
  } catch (error: any) {
    if (error?.code === '42P01') return { fields: [], migrationPending: true }
    throw error
  }
})
