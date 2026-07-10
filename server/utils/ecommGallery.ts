import { pool } from '~/server/db'

/**
 * Lazily provisions the ecomm_gallery table (mirrors the ecommFaqs pattern).
 * Uses CREATE TABLE IF NOT EXISTS so we never run a destructive `prisma db push`
 * against the shared production DB.
 *
 * Gallery is strictly YouTube-only: each row is a YouTube video/Short link in
 * `url` plus a free-text `name` label. (`type`/`media_key` are retained for
 * backwards compatibility but are always 'YOUTUBE'/NULL now.)
 */
export const ensureEcommGalleryTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ecomm_gallery (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'YOUTUBE',
      media_key TEXT,
      url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status BOOLEAN NOT NULL DEFAULT TRUE
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ecomm_gallery_company_status_sort_idx
    ON ecomm_gallery (company_id, status, sort_order)
  `)
}
