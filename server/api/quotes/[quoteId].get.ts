import { createError, defineEventHandler, getRouterParam } from 'h3'
import { pool } from '../../db'
import { quoteCompany, readQuote } from '../../utils/erp-quotes'
import { readQuotePreferences } from '../../utils/quote-preferences'
import { readQuoteDocumentCompany, readQuoteDocumentCustomerAddress } from '../../utils/quote-document'

export default defineEventHandler(async event => {
  const { companyId } = await quoteCompany(event)
  const id = getRouterParam(event, 'quoteId')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Select a quote.' })
  // A consistent snapshot keeps line metadata and replaced line IDs together during concurrent edits.
  const db = await pool.connect()
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const result = await readQuote(db, companyId, id)
    const preferences = await readQuotePreferences(db, companyId)
    const documentCompany = await readQuoteDocumentCompany(db, companyId)
    const clientAddress = await readQuoteDocumentCustomerAddress(db, companyId, result.clientId)
    await db.query('COMMIT')
    return { ...result, documentCompany, clientAddress, documentDesign: preferences.documentDesign }
  } catch (error) { await db.query('ROLLBACK'); throw error }
  finally { db.release() }
})
