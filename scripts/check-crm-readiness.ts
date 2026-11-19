import 'dotenv/config'
import { Pool } from 'pg'
import { crmReady, crmTableReady, crmClientSource } from '../server/utils/crm'
import { crmCommerce } from '../server/utils/crm-workflows'
const company='13fc3233-d673-4fc8-9288-abf6aede91f3',pool=new Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect()
try{
  await db.query('BEGIN READ ONLY')
  const exists=(await db.query('SELECT name FROM companies WHERE id=$1',[company])).rows[0]
  if(!exists)throw Error('Requested company not found')
  const ready=await crmReady(db),marketing=await crmTableReady(db,'ecomm_marketing_campaigns')
  const client=(await db.query('SELECT client_id FROM company_clients WHERE company_id=$1 ORDER BY client_id LIMIT 1',[company])).rows[0]
  const history=client?await crmCommerce(db,company,client.client_id):null
  // Virtual default columns validate the real client SELECT while the prepared
  // migration is pending. This is one read-only statement, not a view or schema.
  const defaults=ready?'':`WITH company_clients AS (SELECT company_id,client_id,status,pipeline_status,'{}'::jsonb AS crm_data,0 AS crm_version,NULL::text AS crm_account_id FROM public.company_clients) `
  const projection=(await db.query(`${defaults}SELECT r.id,r.version,r.lifecycle FROM ${crmClientSource} r WHERE r.company_id=$1 ORDER BY r.id LIMIT 1`,[company])).rows
  const contactTable=await crmTableReady(db,'crm_contacts')
  console.log(JSON.stringify({company:exists.name,crmReady:ready,marketingReady:marketing,historyReadOnly:!!history,clientProjectionReadOnly:projection.length>0,separateContactTableExists:contactTable,historyQueries:['bills','quotes','orders','products','legacyActivities']}))
  await db.query('COMMIT')
}finally{db.release();await pool.end()}
