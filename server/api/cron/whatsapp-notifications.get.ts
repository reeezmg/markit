import { timingSafeEqual } from 'node:crypto'
import { defineEventHandler, getHeader, createError, setHeader } from 'h3'
import { pool } from '../../db'
import { notificationsReady, processNotifications } from '../../utils/whatsapp-notifications'
export default defineEventHandler(async event=>{
  const secret=process.env.CRON_SECRET||'',actual=Buffer.from(getHeader(event,'authorization')||''),expected=Buffer.from('Bearer '+secret)
  if(secret.length<16||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw createError({statusCode:401,statusMessage:'Unauthorized'})
  setHeader(event,'Cache-Control','no-store')
  if(!await notificationsReady())return {ready:false,results:[]}
  const companies=(await pool.query(`SELECT s.company_id FROM whatsapp_notification_settings s JOIN companies c ON c.id=s.company_id AND c.status
    WHERE s.enabled ORDER BY s.company_id`)).rows
  const results:any[]=[]
  for(const row of companies){try{results.push({companyId:row.company_id,...await processNotifications(row.company_id)})}catch{results.push({companyId:row.company_id,error:'Notification processing failed; check server logs and message activity.'})}}
  if(results.some(r=>r.error))throw createError({statusCode:500,statusMessage:'Some company notification runs failed.',data:results})
  return {ready:true,results}
})
