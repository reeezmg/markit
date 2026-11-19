import { randomUUID } from 'node:crypto'
import { invoiceCents, invoiceDay, invoiceText, invoiceToday, retainerBalances, retainerInput } from '../../utils/invoice-programs'
import { billCreditCents, moneyCents, receiptStatus, reversedReceiptStatus } from '../../utils/bill-credit'
import { programCompany, programCustomer, programError, programInput } from './invoice-programs'
import { dateUnlocked, receiptBill } from './bill-receipts'
import { saveSourceRequest } from './source-save-request'

const columns = `r.*,r.client_id AS "clientId",r.liability_account_id AS "liabilityAccountId",r.terms_and_conditions AS "termsAndConditions",
  to_char(r.retainer_date,'YYYY-MM-DD') AS "retainerDate",c.name AS "clientName",c.phone AS "clientPhone",a.name AS "liabilityAccountName"`
const joins = `JOIN clients c ON c.id=r.client_id JOIN accountant_v2_accounting_accounts a ON a.id=r.liability_account_id AND a.company_id=r.company_id`
const balanceColumns = `COALESCE(sum(e.amount) FILTER(WHERE e.kind='COLLECTION'),0) AS collected,
  COALESCE(sum(e.amount) FILTER(WHERE e.kind='APPLY'),0)-COALESCE(sum(e.amount) FILTER(WHERE e.kind='UNAPPLY'),0) AS applied,
  COALESCE(sum(e.amount) FILTER(WHERE e.kind='REFUND'),0) AS refunded`
export async function listRetainers(db: any, companyId: string, q = '', status = '') {
  if (!['','DRAFT','SENT','VOID'].includes(status)) throw programError('Invalid retainer status.', 400)
  return (await db.query(`SELECT ${columns},balances.*,(balances.collected-balances.applied-balances.refunded) AS available
    FROM retainer_invoices r ${joins} CROSS JOIN LATERAL (SELECT ${balanceColumns} FROM retainer_events e WHERE e.retainer_id=r.id AND e.company_id=r.company_id) balances
    WHERE r.company_id=$1 AND (c.name ILIKE $2 OR r.description ILIKE $2 OR ('RET-'||r.number::text) ILIKE $2)
    AND ($3='' OR r.status=$3) ORDER BY r.number DESC LIMIT 500`, [companyId, '%' + String(q).slice(0,200) + '%', status])).rows
}
export async function readRetainer(db: any, companyId: string, id: string, lock = false) {
  const row = (await db.query(`SELECT ${columns} FROM retainer_invoices r ${joins} WHERE r.id=$1 AND r.company_id=$2 ${lock ? 'FOR UPDATE OF r' : ''}`, [id, companyId])).rows[0]
  if (!row) throw programError('Retainer invoice not found.', 404)
  const events = (await db.query(`SELECT e.*,to_char(e.event_date,'YYYY-MM-DD') AS "eventDate",a.name AS "accountName",b.invoice_code AS "invoiceCode",
      reverse.id AS "reversalId" FROM retainer_events e
    LEFT JOIN accountant_v2_accounting_accounts a ON a.id=e.account_id AND a.company_id=e.company_id
    LEFT JOIN bills b ON b.id=e.bill_id AND b.company_id=e.company_id
    LEFT JOIN retainer_events reverse ON reverse.reverses_id=e.id AND reverse.company_id=e.company_id
    WHERE e.retainer_id=$1 AND e.company_id=$2 ORDER BY e.event_date,e.created_at,e.id`, [id, companyId])).rows
  return { ...row, amount: Number(row.amount), events, ...retainerBalances(events) }
}
async function activeAccount(db: any, companyId: string, id: string, types: string[], currency: string) {
  const row = (await db.query(`SELECT id,account_type FROM accountant_v2_accounting_accounts WHERE id=$1 AND company_id=$2
    AND account_type::text=ANY($3::text[]) AND currency=$4 AND is_active=true AND deleted_at IS NULL FOR SHARE`, [id, companyId, types, currency])).rows[0]
  if (!row) throw programError('Select an active company account of the required type and currency.')
  return row
}
export async function retainerOptions(db: any, companyId: string) {
  return { accounts: (await db.query(`SELECT a.id,a.name,a.account_type AS type,a.currency FROM accountant_v2_accounting_accounts a
    JOIN companies c ON c.id=a.company_id AND c.currency=a.currency WHERE a.company_id=$1 AND a.account_type IN ('CASH','BANK','OTHER_CURRENT_LIABILITY')
    AND a.is_active=true AND a.deleted_at IS NULL ORDER BY a.name`, [companyId])).rows }
}
export async function saveRetainer(db: any, context: any, body: any, id?: string) {
  const input = programInput(() => retainerInput(body)), { companyId, userId } = context, company = await programCompany(db, companyId)
  return saveSourceRequest(db, companyId, userId, 'retainer-save:' + (id || 'new'), body.requestId, { ...input, revision: body.revision }, async () => {
    await programCustomer(db, companyId, input.clientId)
    await activeAccount(db, companyId, input.liabilityAccountId, ['OTHER_CURRENT_LIABILITY'], company.currency)
    const old = id ? await readRetainer(db, companyId, id, true) : null
    if (old && (old.revision !== body.revision || old.events.length || old.status === 'VOID')) throw programError('This retainer changed or has payments. Reload it; paid retainers cannot be edited.')
    if (old && old.currency !== company.currency) throw programError('The company currency changed. Create a new retainer.')
    const number = old?.number || Number((await db.query('SELECT COALESCE(max(number),0)+1 AS number FROM retainer_invoices WHERE company_id=$1', [companyId])).rows[0].number)
    const retainerId = id || randomUUID(), revision = randomUUID()
    await db.query(`INSERT INTO retainer_invoices(id,company_id,client_id,number,currency,retainer_date,description,reference,notes,terms_and_conditions,amount,liability_account_id,revision,created_by,updated_at)
      VALUES($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13,$14,now()) ON CONFLICT(id) DO UPDATE SET
      client_id=EXCLUDED.client_id,retainer_date=EXCLUDED.retainer_date,description=EXCLUDED.description,reference=EXCLUDED.reference,notes=EXCLUDED.notes,
      terms_and_conditions=EXCLUDED.terms_and_conditions,amount=EXCLUDED.amount,liability_account_id=EXCLUDED.liability_account_id,revision=EXCLUDED.revision,updated_at=now()
      WHERE retainer_invoices.company_id=$2`, [retainerId, companyId, input.clientId, number, company.currency, input.retainerDate, input.description,
      input.reference, input.notes, input.termsAndConditions, input.amount, input.liabilityAccountId, revision, userId])
    return { id: retainerId, revision, number }
  })
}

async function retainerJournal(db: any, input: any) {
  const id = randomUUID()
  await db.query(`INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,reversed_from_id,created_by_id,updated_at)
    VALUES($1,$2,$3,$4::date,$5,$6,$7,$8,'PUBLISHED',now(),true,$9,$10,$11,$12,now())`,
  [id, input.companyId, 'RET-' + id, input.date, input.reference, 'Retainer ' + input.kind.toLowerCase(), input.currency, input.amount,
    input.sourceType, input.sourceId, input.reversedFrom || null, input.userId])
  for (const [accountId, side] of [[input.debit, 'DEBIT'], [input.credit, 'CREDIT']]) {
    await db.query(`INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,source_parties,updated_at)
      VALUES($1,$2,$3,$4,$5::"AccountantJournalEntrySide",$6,$7,$8::jsonb,now())`,
    [randomUUID(), input.companyId, id, accountId, side, input.amount, input.reference, JSON.stringify(input.parties || {})])
  }
  return id
}

/** Caller owns transaction. Company -> retainer -> invoice -> accountant lock. Never mutate the original journal. */
export async function retainerAction(db: any, context: any, id: string, body: any) {
  const { companyId, userId } = context, company = await programCompany(db, companyId)
  return saveSourceRequest(db, companyId, userId, 'retainer-action:' + id, body.requestId, body, async () => {
    const row = await readRetainer(db, companyId, id, true)
    if (row.status === 'VOID') throw programError('This retainer has been voided.')
    if (body.action === 'sent' || body.action === 'void') {
      if (body.action === 'void' && row.events.length) throw programError('A retainer with financial history cannot be voided. Refund its unused advance instead.')
      await db.query('UPDATE retainer_invoices SET status=$3,revision=$4,updated_at=now() WHERE id=$1 AND company_id=$2', [id, companyId, body.action === 'void' ? 'VOID' : 'SENT', randomUUID()])
      return { success: true }
    }
    if (!['collect','apply','refund','unapply'].includes(body.action)) throw programError('Select a valid retainer action.', 400)
    const date = programInput(() => invoiceDay(body.date)), reference = programInput(() => invoiceText(body.reference, 'Reference', 200)) || 'RET-' + row.number
    if (date > invoiceToday() || date < row.retainerDate || row.events.some((e: any) => e.eventDate > date)) throw programError('Use a date on or after the retainer and its latest transaction, up to today.')
    if (row.currency !== company.currency) throw programError('The company currency changed. Review this retainer with your accountant.')
    await programCustomer(db, companyId, row.clientId)
    const eventId = randomUUID(), kind = ({ collect: 'COLLECTION', apply: 'APPLY', refund: 'REFUND', unapply: 'UNAPPLY' } as any)[body.action]
    let amount = 0, debit = '', credit = '', billId: string | null = null, paymentId: string | null = null, reverses: any = null,
      sourceType = 'RETAINER_' + kind, sourceId: string = eventId, parties: any = {}, reversedFrom: string | null = null
    if (body.action === 'unapply') {
      reverses = row.events.find((e: any) => e.id === body.eventId && e.kind === 'APPLY' && !e.reversalId)
      if (!reverses) throw programError('Application is missing or already removed.')
      amount = Number(reverses.amount); billId = reverses.bill_id
    } else amount = programInput(() => invoiceCents(body.amount)) / 100
    if (body.action === 'apply' || body.action === 'refund') {
      if (moneyCents(amount) > moneyCents(row.available)) throw programError('Amount exceeds the unused collected advance. Reload the retainer.')
    }
    if (body.action === 'collect' && moneyCents(amount) > moneyCents(row.amount) - moneyCents(row.collected)) throw programError('Collection exceeds the requested amount still unpaid.')
    if (body.action === 'apply') billId = programInput(() => invoiceText(body.billId, 'Invoice', 128, true))
    let invoiceState: any = null
    if (billId) {
      invoiceState = await receiptBill(db, companyId, billId, true)
      if (invoiceState.bill.client_id !== row.clientId) throw programError('Retainers can only be applied to invoices for the same customer.')
      const invoiceDate = new Date(new Date(invoiceState.bill.created_at).getTime() + 19800000).toISOString().slice(0,10)
      if (date < invoiceDate) throw programError('Application date cannot precede the invoice date.')
    }
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['accountant-v2:' + companyId])
    await dateUnlocked(db, companyId, date)
    await activeAccount(db, companyId, row.liabilityAccountId, ['OTHER_CURRENT_LIABILITY'], row.currency)
    if (body.action === 'collect' || body.action === 'refund') {
      if (!['Cash','UPI','Card','Bank'].includes(body.paymentMethod)) throw programError('Select Cash, UPI, Card or Bank.')
      await activeAccount(db, companyId, body.accountId, [body.paymentMethod === 'Cash' ? 'CASH' : 'BANK'], row.currency)
      debit = body.action === 'collect' ? body.accountId : row.liabilityAccountId
      credit = body.action === 'collect' ? row.liabilityAccountId : body.accountId
    } else if (body.action === 'apply') {
      if (moneyCents(amount) > moneyCents(invoiceState.outstanding)) throw programError('Application exceeds the invoice balance.')
      const source = (await db.query(`SELECT s.*,j.currency,j.status AS journal_status,j.deleted_at AS journal_deleted
        FROM accountant_v2_erp_sources s JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=s.company_id
        WHERE s.company_id=$1 AND s.source_key=$2`, [companyId, 'bill:' + billId])).rows[0]
      if (!source || source.signature?.excluded || source.journal_status !== 'PUBLISHED' || source.journal_deleted || source.currency !== row.currency) throw programError('Post this invoice in ERP Accounting with the same currency before applying an advance.')
      const obligation = (await db.query(`SELECT sum(l.amount) AS amount,(jsonb_agg(l.source_parties)->0) AS source_parties FROM accountant_v2_manual_journal_lines l
        JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
        WHERE l.company_id=$1 AND l.journal_id=$2 AND l.account_id=$3 AND l.side='DEBIT' AND l.deleted_at IS NULL
        AND a.account_type='ACCOUNTS_RECEIVABLE' HAVING count(*)>0`, [companyId, source.journal_id, source.accounts?.receivable])).rows[0]
      if (!obligation || moneyCents(obligation.amount) !== billCreditCents(invoiceState.bill)) throw programError('The posted invoice receivable needs accounting review.')
      await activeAccount(db, companyId, source.accounts.receivable, ['ACCOUNTS_RECEIVABLE'], row.currency)
      debit = row.liabilityAccountId; credit = source.accounts.receivable; parties = obligation.source_parties || {}
      paymentId = randomUUID(); sourceType = 'ERP_CREDIT_RECEIPT'; sourceId = paymentId
      await db.query(`INSERT INTO payments(id,company_id,bill_id,client_id,payment_date,payment_mode,payment_reference,amount,currency,status,updated_at)
        VALUES($1,$2,$3,$4,$5::date,'Retainer',$6,$7,$8,$9,now())`, [paymentId, companyId, billId, row.clientId, date, reference, amount, row.currency, receiptStatus])
    } else {
      const payment = invoiceState.payments.find((p: any) => p.id === reverses.payment_id && p.status === receiptStatus && !p.deleted && p.payment_mode === 'Retainer')
      if (!payment || moneyCents(payment.amount) !== moneyCents(amount)) throw programError('The applied payment needs accounting review.')
      const journal = (await db.query(`SELECT id,status,deleted_at FROM accountant_v2_manual_journals WHERE id=$1 AND company_id=$2`, [reverses.journal_id, companyId])).rows[0]
      const lines = (await db.query(`SELECT account_id,side,amount,source_parties FROM accountant_v2_manual_journal_lines WHERE journal_id=$1 AND company_id=$2 AND deleted_at IS NULL`, [reverses.journal_id, companyId])).rows
      if (journal?.status !== 'PUBLISHED' || journal.deleted_at || lines.length !== 2 || lines.some((l: any) => moneyCents(l.amount) !== moneyCents(amount))) throw programError('The application journal needs accounting review.')
      debit = lines.find((l: any) => l.side === 'CREDIT')?.account_id; credit = lines.find((l: any) => l.side === 'DEBIT')?.account_id
      if (!debit || credit !== row.liabilityAccountId) throw programError('The application journal needs accounting review.')
      await activeAccount(db, companyId, debit, ['ACCOUNTS_RECEIVABLE'], row.currency)
      parties = lines[0].source_parties || {}; sourceType = 'ERP_CREDIT_RECEIPT_REVERSAL'; sourceId = reverses.payment_id; reversedFrom = reverses.journal_id
      await db.query('UPDATE payments SET status=$3,updated_at=now() WHERE id=$1 AND company_id=$2', [reverses.payment_id, companyId, reversedReceiptStatus])
    }
    const journalId = await retainerJournal(db, { companyId, userId, currency: row.currency, kind, date, reference, amount, debit, credit, sourceType, sourceId, parties, reversedFrom })
    await db.query(`INSERT INTO retainer_events(id,company_id,retainer_id,kind,amount,event_date,reference,payment_method,account_id,bill_id,payment_id,journal_id,reverses_id,created_by)
      VALUES($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13,$14)`, [eventId, companyId, id, kind, amount, date, reference,
      ['collect','refund'].includes(body.action) ? body.paymentMethod : null, ['collect','refund'].includes(body.action) ? body.accountId : null,
      billId, paymentId, journalId, reverses?.id || null, userId])
    if (billId) {
      const remaining = moneyCents(invoiceState.outstanding) + (kind === 'UNAPPLY' ? moneyCents(amount) : -moneyCents(amount))
      await db.query(`UPDATE bills SET payment_status=$3::"PaymentStatus",updated_at=now() WHERE id=$1 AND company_id=$2`, [billId, companyId, remaining <= 0 ? 'PAID' : 'PENDING'])
    }
    await db.query(`UPDATE retainer_invoices SET status='SENT',revision=$3,updated_at=now() WHERE id=$1 AND company_id=$2`, [id, companyId, randomUUID()])
    return { success: true, eventId, journalId }
  })
}
