import { createError, getQuery, setHeader } from 'h3'
import { validUnsubscribeToken } from '~/server/utils/ecommMarketing'

export default defineEventHandler((event) => {
  const q = getQuery(event)
  const company = String(q.company || '')
  const client = String(q.client || '')
  const token = String(q.token || '')
  if (!company || !client || !validUnsubscribeToken(company, client, token)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid unsubscribe link' })
  }
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  const action = `/api/marketing/unsubscribe?company=${encodeURIComponent(company)}&client=${encodeURIComponent(client)}&token=${token}`
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribe</title></head><body style="font:16px system-ui;max-width:36rem;margin:3rem auto;padding:1rem"><h1>Unsubscribe from store emails</h1><p>You will stop receiving marketing messages from this store. Order and account emails are unaffected.</p><form method="post" action="${action}"><button style="padding:.7rem 1rem">Confirm unsubscribe</button></form></body></html>`
})
