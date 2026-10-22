import { defineEventHandler, getQuery, createError } from 'h3'
import { getReadCompanyIds } from '~/server/utils/organizationReadScope'
import { readReceiptData } from '~/server/utils/receiptData'

export default defineEventHandler(async event => {
  const companyIds = await getReadCompanyIds(event)
  const { id } = getQuery(event)
  if (typeof id !== 'string' || !id) throw createError({ statusCode: 400, statusMessage: 'billId is required' })
  return readReceiptData(id, companyIds)
})
