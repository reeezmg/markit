import crypto from 'crypto'
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

type IncomingField = {
  id?: string
  scope?: string
  key?: string
  label?: string
  type?: string
  options?: unknown
  required?: boolean
  active?: boolean
}

const SCOPES = new Set(['PRODUCT', 'VARIANT'])
const TYPES = new Set(['TEXT', 'SELECT'])

// A field's `key` is what product/variant rows store their value under, so it is
// generated once from the label and then never re-derived — renaming a label
// keeps existing values attached.
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'field'

// Full replace of the company's custom field definitions.
// Body: { fields: [{ id?, scope, key?, label, type, options[], required, active }] }
// Order in the array becomes sort_order. Definitions missing from the array are
// deleted (values already stored on products/variants are left untouched).
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<{ fields?: IncomingField[] }>(event)
  const incoming = Array.isArray(body?.fields) ? body!.fields! : []

  // ── validate + normalize ───────────────────────────────────────────────
  const usedKeys = new Map<string, Set<string>>() // scope → keys
  const perScopeOrder = new Map<string, number>()

  const normalized = incoming.map((field, index) => {
    const scope = String(field.scope || 'PRODUCT').toUpperCase()
    if (!SCOPES.has(scope)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid scope at position ${index + 1}` })
    }
    const type = String(field.type || 'TEXT').toUpperCase()
    if (!TYPES.has(type)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid field type at position ${index + 1}` })
    }
    const label = String(field.label || '').trim()
    if (!label) {
      throw createError({ statusCode: 400, statusMessage: 'Every custom field needs a label' })
    }

    const options = type === 'SELECT'
      ? Array.from(
          new Set(
            (Array.isArray(field.options) ? field.options : [])
              .map((option) => String(option ?? '').trim())
              .filter(Boolean),
          ),
        )
      : []
    if (type === 'SELECT' && !options.length) {
      throw createError({ statusCode: 400, statusMessage: `"${label}" is a select input — add at least one option` })
    }

    const scopeKeys = usedKeys.get(scope) || new Set<string>()
    const requested = String(field.key || '').trim()
    const base = /^[a-z0-9_]+$/.test(requested) ? requested : slugify(label)
    let key = base
    let suffix = 2
    while (scopeKeys.has(key)) key = `${base}_${suffix++}`
    scopeKeys.add(key)
    usedKeys.set(scope, scopeKeys)

    const sortOrder = perScopeOrder.get(scope) ?? 0
    perScopeOrder.set(scope, sortOrder + 1)

    return {
      id: String(field.id || '').trim() || crypto.randomUUID(),
      scope,
      key,
      label,
      type,
      options,
      required: field.required === true,
      active: field.active !== false,
      sortOrder,
    }
  })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `DELETE FROM product_custom_fields
       WHERE company_id = $1 AND NOT (id = ANY($2::text[]))`,
      [companyId, normalized.map((f) => f.id)],
    )

    for (const field of normalized) {
      await client.query(
        `INSERT INTO product_custom_fields
           (id, company_id, scope, key, label, type, options, required, active, sort_order, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), now())
         ON CONFLICT (id) DO UPDATE SET
           scope = EXCLUDED.scope,
           key = EXCLUDED.key,
           label = EXCLUDED.label,
           type = EXCLUDED.type,
           options = EXCLUDED.options,
           required = EXCLUDED.required,
           active = EXCLUDED.active,
           sort_order = EXCLUDED.sort_order,
           updated_at = now()`,
        [
          field.id, companyId, field.scope, field.key, field.label, field.type,
          field.options, field.required, field.active, field.sortOrder,
        ],
      )
    }

    await client.query('COMMIT')
  } catch (error: any) {
    await client.query('ROLLBACK')
    if (error?.code === '42P01') {
      throw createError({
        statusCode: 503,
        statusMessage: 'product_custom_fields table is missing — run prisma/migrations/20260810120000_add_product_custom_fields/migration.sql',
      })
    }
    throw error
  } finally {
    client.release()
  }

  return { success: true, fields: normalized }
})
