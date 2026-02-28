import { defineEventHandler, getQuery, setResponseStatus } from 'h3'

const VERIFY_TOKEN = 'markit123'

export default defineEventHandler((event) => {
  const query = getQuery(event)

  if (
    query['hub.mode'] === 'subscribe' &&
    query['hub.verify_token'] === VERIFY_TOKEN
  ) {
    return query['hub.challenge'] // ✅ REQUIRED
  }

  setResponseStatus(event, 403)
  return 'Error'
})