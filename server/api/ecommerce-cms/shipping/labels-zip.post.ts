import { defineEventHandler, readBody, setHeader } from 'h3'
import { runShippingBinary } from '~/server/utils/shipping'

export default defineEventHandler(async event => {
  const { body, contentType } = await runShippingBinary(event, { method: 'POST', path: 'labels/zip', body: await readBody(event) })
  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Content-Disposition', 'attachment; filename="shipping-labels.zip"')
  setHeader(event, 'Cache-Control', 'private, no-store')
  return body
})
