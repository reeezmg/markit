import { pool } from '~/server/db'
import { deleteFromR2 } from '~/server/utils/r2'

/**
 * Deleting media from Cloudflare R2 when the row that referenced it is removed
 * or its image is replaced.
 *
 * The one rule everything here exists to enforce: **never delete an object that
 * some row still points at**. Keys are per-upload UUIDs so sharing shouldn't
 * happen, but a stale key slipping through would silently break a live
 * storefront image, so the reference check is done against the database rather
 * than trusted from the caller. That also makes `POST /api/r2/delete` safe to
 * call from the browser — a seller can only ever delete a key that nothing
 * references, which by definition is a key its owner has already detached.
 *
 * Not covered: `ai_chat_messages.attachments` (JSON blobs, never passed to this
 * util and not reachable from another company's UI).
 */

/** Every scalar column across the app that stores an R2 object key. */
const SCALAR_KEY_COLUMNS: { table: string; columns: string[] }[] = [
  { table: 'categories', columns: ['image', 'banner'] },
  { table: 'subcategories', columns: ['image'] },
  { table: 'brands', columns: ['image', 'banner'] },
  { table: 'collections', columns: ['image', 'banner'] },
  { table: 'companies', columns: ['logo', 'images'] },
  { table: 'users', columns: ['image'] },
  { table: 'distributors', columns: ['images'] },
  { table: 'ecomm_blogs', columns: ['image'] },
  { table: 'ecomm_gallery', columns: ['media_key'] },
]

/** Accepts raw keys, `{ uuid }` shapes and full CDN URLs; returns clean keys. */
export function toMediaKeys(values: unknown): string[] {
  const list = Array.isArray(values) ? values : [values]
  const keys: string[] = []

  for (const value of list) {
    const raw = typeof value === 'string'
      ? value
      : (value as any)?.uuid || (value as any)?.key || ''
    const key = String(raw || '')
      .trim()
      .replace(/^https?:\/\/images\.markit\.co\.in\//i, '')
    if (key) keys.push(key)
  }

  return [...new Set(keys)]
}

/**
 * Of the given keys, the ones no row in the database points at any more.
 * Two queries: one array-column scan over `variants`, one pass over the small
 * scalar tables.
 */
export async function filterUnreferencedKeys(keys: string[]): Promise<string[]> {
  const candidates = toMediaKeys(keys)
  if (!candidates.length) return []

  const referenced = new Set<string>()

  // `images && $1` lets Postgres use a GIN index on variants.images when one
  // exists, and is a single sequential scan when it doesn't.
  const variantRows = await pool.query(
    `SELECT DISTINCT img
       FROM variants v, unnest(v.images) AS img
      WHERE v.images && $1::text[]`,
    [candidates],
  )
  for (const row of variantRows.rows) referenced.add(row.img)

  // ecomm_blogs and ecomm_gallery are provisioned lazily, so on a database where
  // a seller has never opened those CMS pages the tables genuinely do not exist.
  // Querying them anyway would throw and silently disable cleanup everywhere.
  const existing = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [SCALAR_KEY_COLUMNS.map(t => t.table)],
  )
  const presentTables = new Set(existing.rows.map(row => row.table_name))

  const scalarSelects = SCALAR_KEY_COLUMNS
    .filter(({ table }) => presentTables.has(table))
    .flatMap(({ table, columns }) =>
      columns.map(column => `SELECT ${column} AS media_key FROM ${table} WHERE ${column} = ANY($1::text[])`),
    )

  if (scalarSelects.length) {
    const scalarRows = await pool.query(scalarSelects.join(' UNION '), [candidates])
    for (const row of scalarRows.rows) referenced.add(row.media_key)
  }

  return candidates.filter(key => !referenced.has(key))
}

/**
 * Drop media from R2 once nothing references it.
 *
 * Never throws: media cleanup is housekeeping that runs after the database
 * change the user actually asked for has already succeeded, so a failure here
 * must not turn a completed delete into an error. Failures are logged and the
 * object is simply left in the bucket.
 */
export async function cleanupMediaKeys(keys: string[]): Promise<string[]> {
  try {
    const orphans = await filterUnreferencedKeys(keys)
    if (!orphans.length) return []
    return await deleteFromR2(orphans)
  } catch (error) {
    console.error('[mediaCleanup] failed to remove R2 objects:', error)
    return []
  }
}
