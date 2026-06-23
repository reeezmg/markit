import { pool } from '~/server/db'

let _ready: Promise<void> | null = null

async function _init() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS storefront_pages (
        id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        slug        TEXT NOT NULL,
        config      JSONB NOT NULL DEFAULT '{}'::jsonb,
        published   BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE (company_id, slug)
      )
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS storefront_pages_co_slug_idx
      ON storefront_pages (company_id, slug)
    `)
  } catch (err: any) {
    // 23505 = duplicate key on pg_type — another request won the race, table already exists
    if (err.code !== '23505') throw err
  }
}

export const ensureStorefrontPagesTable = () => {
  if (!_ready) _ready = _init()
  return _ready
}
