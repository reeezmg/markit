import { defineEventHandler, getQuery, getRouterParam, readBody, createError } from 'h3'
import { pool } from '../../db'
import { connectCompany } from '../../utils/connect-whatsapp'
import { notificationSettings, saveNotificationSettings, saveNotificationContact, requireNotificationsReady, saveInstallationAppointment, processNotifications } from '../../utils/whatsapp-notifications'

export default defineEventHandler(async event=>{
  const {companyId,userId}=await connectCompany(event),action=getRouterParam(event,'action'),query=getQuery(event)
  const input=async()=>{const body=await readBody(event);if(!body||typeof body!=='object'||Array.isArray(body))throw createError({statusCode:400,statusMessage:'Enter valid notification details.'});return body}
  if(action==='settings'&&event.method==='GET')return notificationSettings(companyId)
  await requireNotificationsReady()
  if(action==='settings'&&event.method==='PUT')return saveNotificationSettings(companyId,userId,await input())
  if(action==='contacts'&&event.method==='POST')return saveNotificationContact(companyId,userId,await input())
  if(action==='contacts'&&event.method==='GET')return (await pool.query(`SELECT c.id,c.name,c.phone,n.recipient,n.service_consent,n.marketing_consent,n.evidence,n.updated_at,
    n.client_phone IS DISTINCT FROM COALESCE(c.phone,'') AS phone_changed FROM company_clients cc JOIN clients c ON c.id=cc.client_id AND NOT c.deleted
    LEFT JOIN whatsapp_notification_contacts n ON n.company_id=cc.company_id AND n.client_id=c.id
    WHERE cc.company_id=$1 AND concat_ws(' ',c.name,c.phone,n.recipient) ILIKE $2 ORDER BY c.name,c.id LIMIT 100`,[companyId,'%'+String(query.q||'').slice(0,200)+'%'])).rows
  if(action==='queue'&&event.method==='GET')return (await pool.query(`SELECT o.id,o.event_type,o.status,o.available_at,o.created_at,o.reason,c.name AS client_name,
    m.status AS delivery_status,m.recipient,m.meta_id FROM whatsapp_notification_outbox o LEFT JOIN clients c ON c.id=o.client_id
    LEFT JOIN connect_whatsapp_messages m ON m.id=o.message_id WHERE o.company_id=$1 ORDER BY o.created_at DESC,o.id LIMIT 100`,[companyId])).rows
  if(action==='installations'&&event.method==='POST')return saveInstallationAppointment(companyId,userId,await input())
  if(action==='installations'&&event.method==='GET')return (await pool.query(`SELECT p.id,p.reference,p.name,p.serial_number,c.name AS client_name,i.id AS appointment_id,i.appointment_on,i.technician,i.status
    FROM customer_products p JOIN clients c ON c.id=p.client_id LEFT JOIN whatsapp_installation_appointments i ON i.customer_product_id=p.id AND i.company_id=p.company_id
    WHERE p.company_id=$1 AND p.status='ACTIVE' AND p.installed_on IS NULL AND concat_ws(' ',p.reference,p.name,p.serial_number,c.name) ILIKE $2
    ORDER BY p.created_at DESC,p.id LIMIT 100`,[companyId,'%'+String(query.q||'').slice(0,200)+'%'])).rows
  if(action==='process'&&event.method==='POST')return processNotifications(companyId)
  throw createError({statusCode:405,statusMessage:'Unsupported notification action.'})
})
