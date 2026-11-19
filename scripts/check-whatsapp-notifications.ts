import 'dotenv/config'
import { Pool } from 'pg'
import { readNotificationFacts } from '../server/utils/whatsapp-notification-sources'
const db=new Pool({connectionString:process.env.DATABASE_URL})
try{
  const rows=(await db.query(`SELECT name,to_regclass('public.connect_whatsapp_connections') IS NOT NULL AS connect_ready,
    to_regclass('public.whatsapp_notification_outbox') IS NOT NULL AS notifications_ready FROM companies WHERE id=$1`,['13fc3233-d673-4fc8-9288-abf6aede91f3'])).rows
  console.log(JSON.stringify({companies:rows,appConfigured:!!process.env.WHATSAPP_APP_ID,encryptionConfigured:!!process.env.WHATSAPP_ENCRYPTION_KEY,originConfigured:!!process.env.WHATSAPP_NOTIFICATION_ORIGIN}))
  const client=await db.connect()
  try{
    await client.query('BEGIN READ ONLY')
    const facts=await readNotificationFacts(client,'13fc3233-d673-4fc8-9288-abf6aede91f3')
    console.log(JSON.stringify({readOnlyFacts:facts.reduce<Record<string,number>>((counts,f)=>({...counts,[f.type]:(counts[f.type]||0)+1}),{})}))
    const cutoff=(await client.query(`SELECT '2026-11-18T00:00:00.999Z'::timestamptz < ('2026-11-18T00:00:00Z'::timestamptz + interval '1 second') AS same_second,
      '2026-11-18T00:00:01Z'::timestamptz < ('2026-11-18T00:00:00Z'::timestamptz + interval '1 second') AS next_second`)).rows[0]
    if(!cutoff.same_second||cutoff.next_second)throw Error('STOP timestamp precision check failed')
    console.log(JSON.stringify({stopTimestampBoundary:'PASS'}))
    await client.query('COMMIT')
  }finally{client.release()}
}finally{await db.end()}
