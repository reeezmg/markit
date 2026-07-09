import { defineEventHandler, readBody, getRouterParam, createError } from 'h3'
import { pool } from '~/server/db'

// Update a dimension preset (box or product) owned by the company.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const body = await readBody<{
    name?: string; type?: string
    weight?: number | null; length?: number | null; width?: number | null; height?: number | null
  }>(event)

  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const type = body?.type === 'product' ? 'product' : 'box'
  const num = (v: any) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v))

  const { rows } = await pool.query(
    `UPDATE shipping_boxes
     SET name = $1, type = $2, weight = $3, length = $4, width = $5, height = $6, updated_at = now()
     WHERE id = $7 AND company_id = $8
     RETURNING id, name, type, weight, length, width, height, status`,
    [name, type, num(body?.weight), num(body?.length), num(body?.width), num(body?.height), id, companyId],
  )
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return { dimension: rows[0] }
})
