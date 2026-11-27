import 'dotenv/config'
import { Pool } from 'pg'
import { crmKinds } from '../utils/crm'
import { crmList, crmReady } from '../server/utils/crm'
import { crmDetail } from '../server/utils/crm-workflows'

// Real post-removal reads only; no schemas, data updates or customer messages.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 })
const db = await pool.connect()
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const tableExists = (await db.query("SELECT to_regclass('public.crm_accounts') IS NOT NULL AS exists")).rows[0].exists
  const columns = (await db.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'
    AND ((table_name='company_clients' AND column_name='crm_account_id') OR (table_name IN('crm_deals','crm_activities') AND column_name='account_id'))`)).rows
  if (tableExists || columns.length || !await crmReady(db)) throw Error('Database removal/readiness verification failed.')
  const actors = (await db.query(`SELECT DISTINCT ON(cu.company_id) cu.company_id,cu.user_id,cu.role FROM company_users cu
    WHERE cu.status=true AND cu.deleted=false AND cu.role::text IN('admin','manager')
    AND (EXISTS(SELECT 1 FROM crm_settings s WHERE s.company_id=cu.company_id)
      OR EXISTS(SELECT 1 FROM crm_deals d WHERE d.company_id=cu.company_id)
      OR EXISTS(SELECT 1 FROM crm_activities a WHERE a.company_id=cu.company_id))
    ORDER BY cu.company_id,cu.user_id`)).rows
  let lists = 0, details = 0
  for (const member of actors) {
    const actor = { companyId: member.company_id, userId: member.user_id, role: member.role, manager: true }
    for (const kind of crmKinds) {
      const result = await crmList(db, actor, kind, { pageSize: 1 })
      await crmList(db, actor, kind, { q: 'crm-verification-no-match', minScore: 1, pageSize: 1 })
      lists += 2
      if (result.rows[0]) { await crmDetail(db, actor, kind, result.rows[0].id); details++ }
    }
  }
  await db.query('COMMIT')
  console.log(JSON.stringify({ accountTableExists: false, removedColumns: columns.length, crmReady: true, companiesChecked: actors.length, listReads: lists, detailReads: details, databaseChanged: false }))
} catch (error) {
  await db.query('ROLLBACK')
  throw error
} finally {
  db.release()
  await pool.end()
}
