import { defineEventHandler, getQuery, getHeader, readRawBody, createError } from 'h3'
import { randomUUID } from 'node:crypto'
import { pool } from '../../../db'
import { ensureConnectSchema, whatsappConfig } from '../../../utils/connect-whatsapp'
import { validSignature } from '../../../utils/connect-whatsapp-security'
import { revokeNotificationContact } from '../../../utils/whatsapp-notifications'

export default defineEventHandler(async event => {
  const cfg = whatsappConfig()
  if (event.method === 'GET') {
    const query = getQuery(event)
    if (cfg.verifyToken && query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === cfg.verifyToken) return String(query['hub.challenge'] || '')
    throw createError({ statusCode: 403, statusMessage: 'Webhook verification failed' })
  }
  if (event.method !== 'POST') throw createError({ statusCode: 405 })
  const raw = await readRawBody(event, 'utf8') || ''
  if (!validSignature(raw, getHeader(event, 'x-hub-signature-256') || '', cfg.appSecret)) throw createError({ statusCode: 401, statusMessage: 'Invalid webhook signature' })
  if (Buffer.byteLength(raw) > 2_000_000) throw createError({ statusCode: 413 })
  let payload: any
  try { payload = JSON.parse(raw) } catch { throw createError({ statusCode: 400 }) }
  if (payload.object !== 'whatsapp_business_account') return { received: true }
  await ensureConnectSchema()
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue
      const value = change.value, phoneId = value?.metadata?.phone_number_id
      if (!phoneId) continue
      const db = await pool.connect()
      try {
        await db.query('BEGIN')
        // Same lock as send: receipts cannot overtake the accepted-message commit.
        const row = (await db.query('SELECT id FROM connect_whatsapp_connections WHERE phone_id=$1 AND waba_id=$2 AND active=true FOR UPDATE', [phoneId, String(entry.id)])).rows[0]
        if (row) {
          for (const message of value.messages || []) {
            const timestamp = Number(message.timestamp) * 1000
            if (!message.id || !/^[1-9]\d{7,14}$/.test(message.from || '') || !Number.isFinite(timestamp) || timestamp > Date.now() + 300000) continue
            // Store text/media metadata only. No media downloads or tenant AI routing.
            const inserted=await db.query(`INSERT INTO connect_whatsapp_messages(id,connection_id,meta_id,recipient,direction,kind,content,status,created_at)
              VALUES($1,$2,$3,$4,'inbound',$5,$6,'RECEIVED',$7) ON CONFLICT(meta_id) DO NOTHING`,
            [randomUUID(), row.id, message.id, message.from, message.type || 'unknown', { text: message.text?.body || '', caption: message[message.type]?.caption || '', mediaId: message[message.type]?.id || '', context: message.context?.id || '' }, new Date(timestamp)])
            if(inserted.rowCount&&/^(stop|unsubscribe|cancel messages|stop messages)$/i.test(String(message.text?.body||'').trim()))await revokeNotificationContact(db,row.id,message.from,new Date(timestamp))
          }
          for (const status of value.statuses || []) {
            if (!['sent', 'delivered', 'read', 'failed'].includes(status.status)) continue
            const timestamp = Number(status.timestamp) * 1000
            if (!Number.isFinite(timestamp)) continue
            await db.query(`UPDATE connect_whatsapp_messages SET status=$3,status_at=$4,
              content=CASE WHEN $3='FAILED' THEN content || jsonb_build_object('deliveryError', $5::text) ELSE content END
              WHERE connection_id=$1 AND meta_id=$2 AND direction='outbound'
              AND CASE $3 WHEN 'READ' THEN 4 WHEN 'DELIVERED' THEN 3 WHEN 'FAILED' THEN 2 ELSE 1 END
                  >= CASE status WHEN 'READ' THEN 4 WHEN 'DELIVERED' THEN 3 WHEN 'FAILED' THEN 2 WHEN 'SENT' THEN 1 ELSE 0 END`,
            [row.id, status.id, status.status.toUpperCase(), new Date(timestamp), String(status.errors?.[0]?.code || '')])
          }
        }
        await db.query('COMMIT')
      } catch (e) { await db.query('ROLLBACK'); throw e } finally { db.release() }
    }
  }
  return { received: true }
})
