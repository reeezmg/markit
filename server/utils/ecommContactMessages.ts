import { pool } from '~/server/db'

// Storefront contact-form inbox. Mirrors custom-api tables.py / schema.zmodel.
// status: new | opened | replied | closed
export const ensureEcommContactMessagesTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ecomm_contact_messages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      replied_at TIMESTAMPTZ,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE
    )
  `)

  // email was NOT NULL in the first version; a phone-only message needs it nullable.
  await pool.query(`ALTER TABLE ecomm_contact_messages ALTER COLUMN email DROP NOT NULL`)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ecomm_contact_messages_company_status_idx
    ON ecomm_contact_messages (company_id, status, created_at)
  `)
}
