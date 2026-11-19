import { randomUUID } from 'node:crypto'
import { recurringInput, invoiceToday, nextRecurringDate, addInvoiceDays } from '../../utils/invoice-programs'
import { saveSourceRequest } from './source-save-request'
import { programCompany, programCustomer, programError, programInput, programItems, issueProgramInvoice } from './invoice-programs'

const profileSelect = `SELECT r.*,to_char(r.start_date,'YYYY-MM-DD') AS "startDate",to_char(r.end_date,'YYYY-MM-DD') AS "endDate",
  to_char(r.next_date,'YYYY-MM-DD') AS "nextDate",r.generation_mode AS "generationMode",r.due_days AS "dueDays",c.name AS "clientName",c.phone AS "clientPhone"
  FROM recurring_invoices r JOIN clients c ON c.id=r.client_id`
export async function readRecurringInvoice(db: any, companyId: string, id: string, lock = false) {
  const row = (await db.query(`${profileSelect} WHERE r.id=$1 AND r.company_id=$2 ${lock ? 'FOR UPDATE OF r' : ''}`, [id, companyId])).rows[0]
  if (!row) throw programError('Recurring profile not found.', 404)
  const occurrences = (await db.query(`SELECT o.id,to_char(o.invoice_date,'YYYY-MM-DD') AS "invoiceDate",to_char(o.due_date,'YYYY-MM-DD') AS "dueDate",
    o.template,o.bill_id AS "billId",b.invoice_code AS "invoiceCode",b.deleted AS "billDeleted",b.payment_status AS "paymentStatus",c.name AS "clientName",c.phone AS "clientPhone"
    FROM recurring_invoice_occurrences o LEFT JOIN bills b ON b.id=o.bill_id AND b.company_id=o.company_id
    LEFT JOIN clients c ON c.id=o.template->>'clientId'
    WHERE o.profile_id=$1 AND o.company_id=$2 ORDER BY o.invoice_date DESC,o.id DESC LIMIT 200`, [id, companyId])).rows
  return { ...row, occurrences }
}
export async function listRecurringInvoices(db: any, companyId: string, q = '', status = '') {
  if (!['', 'ACTIVE', 'PAUSED', 'COMPLETED'].includes(status)) throw programError('Invalid profile status.', 400)
  return (await db.query(`${profileSelect} WHERE r.company_id=$1 AND (r.name ILIKE $2 OR c.name ILIKE $2)
    AND ($3='' OR r.status=$3) ORDER BY r.created_at DESC,r.id LIMIT 500`, [companyId, '%' + String(q).slice(0,200) + '%', status])).rows
}
export async function saveRecurringInvoice(db: any, context: any, body: any, id?: string) {
  const input = programInput(() => recurringInput(body)), { companyId, userId } = context
  const company = await programCompany(db, companyId)
  return saveSourceRequest(db, companyId, userId, 'recurring-save:' + (id || 'new'), body.requestId, { ...input, revision: body.revision }, async () => {
    await programCustomer(db, companyId, input.template.clientId)
    await programItems(db, companyId, input.template)
    const old = id ? await readRecurringInvoice(db, companyId, id, true) : null
    if (old && old.revision !== body.revision) throw programError('This profile changed. Reload it before saving.')
    if (old && (old.startDate !== input.startDate || old.frequency !== input.frequency || old.interval !== input.interval)) throw programError('Create a new profile to change its start date or frequency.')
    if (old && old.currency !== company.currency) throw programError('The company currency changed. Create a new profile.')
    const nextDate = old?.nextDate || nextRecurringDate(input.startDate, input.frequency, input.interval, invoiceToday(), true)
    const status = input.endDate && nextDate > input.endDate ? 'COMPLETED' : old?.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE'
    const profileId = id || randomUUID(), revision = randomUUID()
    await db.query(`INSERT INTO recurring_invoices(id,company_id,client_id,name,currency,frequency,interval,start_date,end_date,next_date,status,generation_mode,due_days,template,revision,created_by,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10::date,$11,$12,$13,$14::jsonb,$15,$16,now())
      ON CONFLICT(id) DO UPDATE SET client_id=EXCLUDED.client_id,name=EXCLUDED.name,end_date=EXCLUDED.end_date,status=EXCLUDED.status,
      generation_mode=EXCLUDED.generation_mode,due_days=EXCLUDED.due_days,template=EXCLUDED.template,revision=EXCLUDED.revision,last_error=NULL,updated_at=now()
      WHERE recurring_invoices.company_id=$2`, [profileId, companyId, input.template.clientId, input.name, company.currency, input.frequency, input.interval,
      input.startDate, input.endDate || null, nextDate, status, input.generationMode, input.dueDays, JSON.stringify(input.template), revision, userId])
    return { id: profileId, revision }
  })
}

export async function generateRecurringOccurrence(db: any, row: any, date: string, mode = row.generationMode) {
  const id = randomUUID(), dueDate = addInvoiceDays(date, row.dueDays)
  const claim = await db.query(`INSERT INTO recurring_invoice_occurrences(id,company_id,profile_id,invoice_date,due_date,template)
    VALUES($1,$2,$3,$4::date,$5::date,$6::jsonb) ON CONFLICT(profile_id,invoice_date) DO NOTHING RETURNING id`,
  [id, row.company_id, row.id, date, dueDate, JSON.stringify(row.template)])
  if (!claim.rowCount) return { created: false }
  if (mode === 'ISSUE') {
    const bill = await issueProgramInvoice(db, row.company_id, row.created_by, row.template, date, dueDate)
    await db.query('UPDATE recurring_invoice_occurrences SET bill_id=$1 WHERE id=$2 AND company_id=$3', [bill.billId, id, row.company_id])
  }
  return { created: true, id }
}
export async function recurringAction(db: any, context: any, id: string, body: any) {
  const { companyId, userId } = context, company = await programCompany(db, companyId)
  return saveSourceRequest(db, companyId, userId, 'recurring-action:' + id, body.requestId, body, async () => {
    const row = await readRecurringInvoice(db, companyId, id, true)
    if (row.currency !== company.currency) throw programError('The company currency changed. Review this profile.')
    if (body.action === 'pause') {
      if (row.status !== 'ACTIVE') throw programError('Only active profiles can be paused.')
      await db.query(`UPDATE recurring_invoices SET status='PAUSED',revision=$3,updated_at=now() WHERE id=$1 AND company_id=$2`, [id, companyId, randomUUID()])
    } else if (body.action === 'resume') {
      if (row.status !== 'PAUSED') throw programError('Only paused profiles can be resumed.')
      const next = nextRecurringDate(row.startDate, row.frequency, row.interval, row.nextDate > invoiceToday() ? row.nextDate : invoiceToday(), true)
      await db.query(`UPDATE recurring_invoices SET status=$3,next_date=$4::date,last_error=NULL,revision=$5,updated_at=now() WHERE id=$1 AND company_id=$2`,
      [id, companyId, row.endDate && next > row.endDate ? 'COMPLETED' : 'ACTIVE', next, randomUUID()])
    } else if (body.action === 'generate') {
      if (row.status !== 'ACTIVE' || row.nextDate > invoiceToday() || (row.endDate && row.nextDate > row.endDate)) throw programError('This profile has no due occurrence to generate.')
      await generateRecurringOccurrence(db, row, row.nextDate)
      await advanceRecurring(db, row)
    } else if (body.action === 'issue') {
      const occurrence = (await db.query(`SELECT *,to_char(invoice_date,'YYYY-MM-DD') AS day,to_char(due_date,'YYYY-MM-DD') AS due
        FROM recurring_invoice_occurrences WHERE id=$1 AND company_id=$2 AND profile_id=$3 FOR UPDATE`, [body.occurrenceId, companyId, id])).rows[0]
      if (!occurrence) throw programError('Recurring invoice draft not found.', 404)
      if (!occurrence.bill_id) {
        const bill = await issueProgramInvoice(db, companyId, userId, occurrence.template, occurrence.day, occurrence.due)
        await db.query('UPDATE recurring_invoice_occurrences SET bill_id=$1 WHERE id=$2 AND company_id=$3', [bill.billId, occurrence.id, companyId])
      }
    } else throw programError('Select a valid recurring action.', 400)
    return { success: true }
  })
}
async function advanceRecurring(db: any, row: any) {
  const next = nextRecurringDate(row.startDate, row.frequency, row.interval, row.nextDate)
  await db.query(`UPDATE recurring_invoices SET next_date=$3::date,status=$4,last_error=NULL,revision=$5,updated_at=now() WHERE id=$1 AND company_id=$2`,
  [row.id, row.company_id, next, row.endDate && next > row.endDate ? 'COMPLETED' : 'ACTIVE', randomUUID()])
}

/** Company -> profile -> bill lock order matches interactive generation. Each occurrence is atomic. */
export async function processRecurringInvoices(pool: any) {
  const today = invoiceToday(), failedIds: string[] = [], result = { created: 0, failed: 0, remaining: 0 }, deadline = Date.now() + 40000
  for (let i = 0; i < 200 && Date.now() < deadline; i++) {
    const candidate = (await pool.query(`SELECT r.id,r.company_id FROM recurring_invoices r JOIN companies c ON c.id=r.company_id
      WHERE r.status='ACTIVE' AND c.status=true AND r.next_date<=$1::date AND NOT(r.id=ANY($2::text[]))
      ORDER BY r.next_date,r.id LIMIT 1`, [today, failedIds])).rows[0]
    if (!candidate) break
    const db = await pool.connect()
    try {
      await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='8s'"); await db.query("SET LOCAL lock_timeout='3s'")
      const company = await programCompany(db, candidate.company_id)
      const row = await readRecurringInvoice(db, candidate.company_id, candidate.id, true)
      if (row.status !== 'ACTIVE' || row.nextDate > today) { await db.query('ROLLBACK'); continue }
      if (row.currency !== company.currency) throw programError('Review profile currency.')
      if (row.endDate && row.nextDate > row.endDate) {
        await db.query(`UPDATE recurring_invoices SET status='COMPLETED',updated_at=now() WHERE id=$1 AND company_id=$2`, [row.id, candidate.company_id])
      } else {
        await programCustomer(db, row.company_id, row.template.clientId)
        const generated = await generateRecurringOccurrence(db, row, row.nextDate)
        await advanceRecurring(db, row)
        await db.query('COMMIT')
        if (generated.created) result.created++
        continue
      }
      await db.query('COMMIT')
    } catch (error) {
      await db.query('ROLLBACK'); result.failed++; failedIds.push(candidate.id)
      console.error('Recurring invoice generation failed', candidate.id, error)
      await pool.query(`UPDATE recurring_invoices SET last_error=$3,updated_at=now() WHERE id=$1 AND company_id=$2`,
      [candidate.id, candidate.company_id, 'Generation failed. Review the customer, items, ERP Accounting and accounting period, then retry.'])
    } finally { db.release() }
  }
  result.remaining = Number((await pool.query(`SELECT count(*) FROM recurring_invoices r JOIN companies c ON c.id=r.company_id WHERE r.status='ACTIVE' AND c.status=true AND r.next_date<=$1::date`, [today])).rows[0].count)
  return result
}
