import 'dotenv/config'
import { Pool } from 'pg'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { crmReady } from '../server/utils/crm'

// Applies only this explicitly authorized removal. Never pushes the full schema,
// replays old migrations, creates backup tables or creates migration metadata.
const apply = process.argv.includes('--apply')
const migration = '20261123190000_remove_crm_business_accounts'
const sql = await readFile(path.join('prisma/migrations', migration, 'migration.sql'), 'utf8')
const schema = await readFile('schema.zmodel', 'utf8')
if (/model CrmAccount\s*\{|crmAccountId\s+String/.test(schema)) throw Error('Update schema.zmodel before removal.')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 })
const db = await pool.connect()
let committed = false
try {
  await db.query(apply ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  await db.query("SET LOCAL lock_timeout='8s'")
  await db.query("SET LOCAL statement_timeout='60s'")
  const exists = !!(await db.query("SELECT to_regclass('public.crm_accounts') IS NOT NULL AS exists")).rows[0].exists
  if (!apply) {
    console.log(JSON.stringify({ migration, accountTableExists: exists, apply: false }))
    await db.query('ROLLBACK')
  } else {
    await db.query('LOCK TABLE company_clients, crm_deals, crm_activities, crm_settings IN ACCESS EXCLUSIVE MODE')
    await db.query('LOCK TABLE clients, crm_audit IN SHARE MODE')
    if (exists) await db.query('LOCK TABLE crm_accounts IN ACCESS EXCLUSIVE MODE')
    const directory = path.resolve('.cache/crm-business-account-removal', new Date().toISOString().replace(/[:.]/g, '-'))
    await mkdir(directory, { recursive: true })
    const snapshot: Record<string, any> = { capturedAt: new Date().toISOString(), migration }
    for (const [table, column] of [['crm_accounts', null], ['company_clients', 'crm_account_id'], ['crm_deals', 'account_id'], ['crm_activities', 'account_id'], ['crm_settings', null]] as const) {
      if (table === 'crm_accounts' && !exists) { snapshot[table] = []; continue }
      const hasColumn = !column || !!(await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2", [table, column])).rowCount
      snapshot[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM public.${table} t${column ? hasColumn ? ` WHERE ${column} IS NOT NULL` : ' WHERE false' : ''}`)).rows.map(row => row.row)
    }
    snapshot.constraints = (await db.query("SELECT conname,conrelid::regclass::text AS source,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE confrelid=to_regclass('public.crm_accounts')")).rows
    await writeFile(path.join(directory, 'before.json'), JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 })
    const fingerprints = async () => {
      const result: Record<string, any> = {}
      for (const [table, removed] of [['clients', '__none__'], ['company_clients', 'crm_account_id'], ['crm_deals', 'account_id'], ['crm_activities', 'account_id'], ['crm_audit', '__none__']]) {
        result[table] = (await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg((to_jsonb(t)-$1::text)::text,E'\n' ORDER BY (to_jsonb(t)-$1::text)::text),'')) AS fingerprint FROM public.${table} t`, [removed])).rows[0]
      }
      return result
    }
    const before = await fingerprints()
    // Keep the whole operation in this transaction so failed verification rolls back.
    await db.query(sql.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, ''))
    const after = await fingerprints()
    if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Protected client/work/audit records changed; rolling back.')
    const remaining = (await db.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'
      AND ((table_name='company_clients' AND column_name='crm_account_id') OR (table_name IN('crm_deals','crm_activities') AND column_name='account_id'))`)).rows
    const accountTableExists = !!(await db.query("SELECT to_regclass('public.crm_accounts') IS NOT NULL AS exists")).rows[0].exists
    const retiredSettings = Number((await db.query(`SELECT count(*)::int AS count FROM crm_settings WHERE (settings->'scoring') ? 'account'
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(settings->'segments')='array' THEN settings->'segments' ELSE '[]'::jsonb END) segment WHERE (segment->'filters') ? 'accountId')`)).rows[0].count)
    const ready = await crmReady(db)
    if (remaining.length || accountTableExists || retiredSettings || !ready) throw Error('Removal/readiness verification failed; rolling back.')
    const report = { migration, checksum: createHash('sha256').update(sql).digest('hex'), backup: path.join(directory, 'before.json'), before, after, accountTableExists, remaining, retiredSettings, crmReady: ready }
    await writeFile(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
    await db.query('COMMIT')
    committed = true
    await writeFile(path.join(directory, 'committed.json'), JSON.stringify({ committedAt: new Date().toISOString(), migration }), { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({ ...report, committed, migrationHistoryRegistered: false }))
  }
} catch (error) {
  if (!committed) await db.query('ROLLBACK')
  throw error
} finally {
  db.release()
  await pool.end()
}
