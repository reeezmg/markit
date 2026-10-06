import { createError, type H3Event } from 'h3'
import { useCompanyRequestSession } from './companyRequestScope'

/** Historical Accounts is an archive. Financial writes belong to Accountant. */
export async function rejectLegacyAccountingWrite(event: H3Event): Promise<never> {
  await useCompanyRequestSession(event)
  throw createError({
    statusCode: 410,
    statusMessage: 'Legacy Accounts is read-only. Use Accountant for new financial entries.',
  })
}
