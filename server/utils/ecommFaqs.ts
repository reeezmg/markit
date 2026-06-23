import { pool } from '~/server/db'

export const ensureEcommCmsTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ecomm_faqs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status BOOLEAN NOT NULL DEFAULT TRUE,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ecomm_faqs_company_status_sort_idx
    ON ecomm_faqs (company_id, status, sort_order)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ecomm_feedback (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 5,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status BOOLEAN NOT NULL DEFAULT TRUE
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ecomm_feedback_company_status_sort_idx
    ON ecomm_feedback (company_id, status, sort_order)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ecomm_feedback_company_client_idx
    ON ecomm_feedback (company_id, client_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ecomm_blogs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      image TEXT,
      tag TEXT,
      read_minutes INTEGER NOT NULL DEFAULT 4,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE (company_id, slug)
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ecomm_blogs_company_status_sort_idx
    ON ecomm_blogs (company_id, status, sort_order)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ecomm_blogs_company_slug_idx
    ON ecomm_blogs (company_id, slug)
  `)
}

export const ensureEcommFaqsTable = ensureEcommCmsTables
export const ensureEcommFeedbackTable = ensureEcommCmsTables
export const ensureEcommBlogsTable = ensureEcommCmsTables
