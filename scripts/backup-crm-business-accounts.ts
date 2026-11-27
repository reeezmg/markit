import 'dotenv/config'
import { Pool } from 'pg'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Read-only preparation. This script never deletes data or applies the migration.
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = await pool.connect()
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const tables = ['crm_accounts', 'crm_deals', 'crm_activities', 'company_clients', 'crm_settings']
  const snapshot: Record<string, unknown> = { capturedAt: new Date().toISOString() }
  const counts: Record<string, number> = {}
  for (const table of tables) {
    const exists = (await db.query('SELECT to_regclass($1) IS NOT NULL AS exists', ['public.' + table])).rows[0].exists
    if (!exists) { snapshot[table] = []; counts[table] = 0; continue }
    const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table])).rows.map(row => row.column_name)
    const column = table === 'company_clients' ? 'crm_account_id' : 'account_id'
    const where = table === 'crm_accounts' || table === 'crm_settings' ? '' : columns.includes(column) ? ` WHERE ${column} IS NOT NULL` : ' WHERE false'
    const rows = (await db.query(`SELECT to_jsonb(t) AS row FROM public.${table} t${where}`)).rows.map(row => row.row)
    snapshot[table] = rows
    counts[table] = rows.length
  }
  snapshot.constraints = (await db.query(`SELECT c.conname, c.conrelid::regclass::text AS source, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c WHERE c.confrelid=to_regclass('public.crm_accounts') ORDER BY c.conname`)).rows
  const directory = path.resolve('.cache/crm-business-account-removal', new Date().toISOString().replace(/[:.]/g, '-'))
  await mkdir(directory, { recursive: true })
  const file = path.join(directory, 'before.json')
  await writeFile(file, JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 })
  await db.query('COMMIT')
  console.log(JSON.stringify({ backup: file, counts, databaseChanged: false }))
} catch (error) {
  await db.query('ROLLBACK')
  throw error
} finally {
  db.release()
  await pool.end()
}
