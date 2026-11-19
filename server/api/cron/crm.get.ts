import { timingSafeEqual } from 'node:crypto'
import { defineEventHandler, getHeader, createError } from 'h3'
import { pool } from '../../db'
import { crmReady } from '../../utils/crm'
import { processCrmReminders } from '../../utils/crm-reminders'
import { processCrmSalesRules } from '../../utils/crm-sales-rules'
export default defineEventHandler(async event=>{
  const secret=process.env.CRON_SECRET||'',bearer=getHeader(event,'authorization')||'',expected='Bearer '+secret
  if(secret.length<16||bearer.length!==expected.length||!timingSafeEqual(Buffer.from(bearer),Buffer.from(expected)))throw createError({statusCode:401,statusMessage:'Unauthorized'})
  if(!await crmReady(pool))return {ready:false}
  const companies=(await pool.query(`SELECT company_id FROM crm_activities WHERE status='OPEN' AND NOT archived AND reminded_at IS NULL AND due_at<=now()+interval '1 hour' UNION SELECT company_id FROM crm_settings ORDER BY company_id`)).rows
  const results:any[]=[]
  for(const row of companies){const db=await pool.connect();try{
    await db.query('BEGIN');const lock=(await db.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',['crm:'+row.company_id])).rows[0]
    if(!lock?.locked){await db.query('ROLLBACK');continue}
    const salesRules=await processCrmSalesRules(db,row.company_id)
    results.push({companyId:row.company_id,salesRules,...await processCrmReminders(db,row.company_id)});await db.query('COMMIT')
  }catch{await db.query('ROLLBACK');results.push({companyId:row.company_id,error:true})}finally{db.release()}}
  if(results.some(r=>r.error))throw createError({statusCode:500,statusMessage:'Some CRM reminder runs failed.'})
  return {ready:true,results}
})
