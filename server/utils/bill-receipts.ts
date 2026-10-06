import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { billCreditCents, moneyCents, receiptInput, receiptStatus, reversedReceiptStatus } from '../../utils/bill-credit'
import { saveSourceRequest } from './source-save-request'

const fail = (message: string) => createError({ statusCode: 409, statusMessage: message })
type Db = { query: (sql: string, values?: any[]) => Promise<any> }

export async function assertNoBillReceipts(db: Db, companyId: string, billId: string, includeReversed = false) {
  const result = await db.query('SELECT id FROM payments WHERE company_id=$1 AND bill_id=$2 AND status=ANY($3::text[]) AND deleted=false LIMIT 1', [companyId, billId, includeReversed ? [receiptStatus,reversedReceiptStatus] : [receiptStatus]])
  if (result.rows.length) throw fail('Reverse the bill receipts before editing, deleting, transferring or reopening this bill')
}

export async function receiptBill(db: Db, companyId: string, billId: string, lock = false) {
  const bill = (await db.query(`SELECT * FROM bills WHERE id=$1 AND company_id=$2 ${lock ? 'FOR UPDATE' : ''}`, [billId, companyId])).rows[0]
  if (!bill) throw createError({ statusCode: 404, statusMessage: 'Bill not found' })
  if (bill.deleted || bill.precedence || bill.is_markit || (bill.type && bill.type !== 'BILL')) throw fail('Only active POS bills support customer receipts')
  if (bill.credit_user_id) throw fail('Settle staff credit through Staff Accounting')
  if (!['PAID', 'PENDING'].includes(bill.payment_status) || billCreditCents(bill) <= 0) throw fail('This bill has no collectible credit')
  const payments = (await db.query(`SELECT p.*, j.id AS journal_id FROM payments p
    LEFT JOIN accountant_v2_manual_journals j ON j.company_id=p.company_id AND j.source_type='ERP_CREDIT_RECEIPT' AND j.source_id=p.id
    WHERE p.company_id=$1 AND p.bill_id=$2 AND p.status IN ($3,$4) ORDER BY p.payment_date,p.created_at,p.id`, [companyId, billId, receiptStatus, reversedReceiptStatus])).rows
  const paid = payments.filter((p: any) => p.status === receiptStatus && !p.deleted).reduce((n: number, p: any) => n + moneyCents(p.amount), 0)
  return { bill, payments, outstanding: (billCreditCents(bill) - paid) / 100 }
}

async function dateUnlocked(db: Db, companyId: string, date: string) {
  const rows = await db.query(`SELECT reason FROM accountant_v2_transaction_locks WHERE company_id=$1 AND is_locked=true
    AND deleted_at IS NULL AND module IN ('ALL','ACCOUNTS','BANKING') AND lock_date >= $2::timestamp LIMIT 1`, [companyId, date])
  if (rows.rows.length) throw fail('The receipt date is in a locked accounting period')
}

async function postReceipt(db: Db, input: {companyId: string; userId: string; id: string; date: string; amount: number; currency: string; reference: string; lines: any[]; reversedFrom?: string}) {
  const journalId = randomUUID()
  await db.query(`INSERT INTO accountant_v2_manual_journals
    (id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,reversed_from_id,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PUBLISHED',now(),true,$9,$10,$11,now())`,
  [journalId,input.companyId,'CR-'+journalId,input.date,input.reference,input.reversedFrom ? 'Credit receipt reversal' : 'Credit bill collection',input.currency,input.amount,
    input.reversedFrom ? 'ERP_CREDIT_RECEIPT_REVERSAL' : 'ERP_CREDIT_RECEIPT',input.id,input.reversedFrom || null])
  for (const line of input.lines) await db.query(`INSERT INTO accountant_v2_manual_journal_lines
    (id,company_id,journal_id,account_id,side,amount,description,source_parties,updated_at)
    VALUES($1,$2,$3,$4,$5::"AccountantJournalEntrySide",$6,$7,$8::jsonb,now())`,
  [randomUUID(),input.companyId,journalId,line.accountId,line.side,input.amount,input.reference,JSON.stringify(line.parties)])
  return journalId
}

// Caller owns BEGIN/COMMIT; the bill lock serializes competing collections.
export async function recordBillReceipt(db: Db, companyId: string, userId: string, body: any) {
  let input
  try { input = receiptInput(body) } catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message }) }
  return saveSourceRequest(db,companyId,userId,'bill-credit-receipt',body.requestId,input,async () => {
    const state = await receiptBill(db,companyId,input.billId,true)
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['accountant-v2:'+companyId])
    if (state.bill.payment_status === 'PAID') throw fail('This bill is already paid; review its payment history')
    if (moneyCents(input.amount) > moneyCents(state.outstanding)) throw fail('Receipt exceeds the outstanding amount; reload the bill')
    // Date-only receipt dates allow collection on the invoice's calendar day.
    const invoiceDay = new Date(new Date(state.bill.created_at).getTime() + 19800000).toISOString().slice(0,10)
    const receiptDay = new Date(new Date(input.paymentDate).getTime() + 19800000).toISOString().slice(0,10)
    if (receiptDay < invoiceDay) throw fail('Payment date cannot precede the invoice date')
    await dateUnlocked(db,companyId,input.paymentDate)
    const source = (await db.query(`SELECT s.*, j.currency, j.status AS journal_status, j.deleted_at AS journal_deleted
      FROM accountant_v2_erp_sources s LEFT JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=s.company_id
      WHERE s.company_id=$1 AND s.source_key=$2`, [companyId,'bill:'+input.billId])).rows[0]
    if (!source?.journal_id || source.signature?.excluded || source.journal_status !== 'PUBLISHED' || source.journal_deleted) throw fail('Review and post this bill in ERP Accounting before collecting its credit')
    const receivableId = source.accounts?.receivable
    const obligation = (await db.query(`SELECT sum(l.amount) AS amount,(jsonb_agg(l.source_parties)->0) AS source_parties FROM accountant_v2_manual_journal_lines l
      JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
      WHERE l.company_id=$1 AND l.journal_id=$2 AND l.account_id=$3 AND l.side='DEBIT' AND l.deleted_at IS NULL
      AND a.account_type='ACCOUNTS_RECEIVABLE' HAVING count(*)>0`, [companyId,source.journal_id,receivableId])).rows[0]
    if (!obligation || moneyCents(obligation.amount) !== billCreditCents(state.bill)) throw fail('The posted customer receivable disagrees with the bill; review ERP Accounting before collecting')
    const receiving = (await db.query(`SELECT id FROM accountant_v2_accounting_accounts WHERE id=$1 AND company_id=$2
      AND account_type=$3::"AccountantAccountingAccountType" AND is_active=true AND deleted_at IS NULL FOR SHARE`,
    [input.accountId,companyId,input.paymentMethod === 'Cash' ? 'CASH' : 'BANK'])).rows[0]
    if (!receiving) throw fail('Select an active company cash/bank account matching the payment method')
    const id = randomUUID(), parties = obligation.source_parties || {}
    await db.query(`INSERT INTO payments(id,company_id,bill_id,client_id,payment_date,payment_mode,payment_reference,amount,currency,status,deposit_to,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
    [id,companyId,input.billId,state.bill.client_id,input.paymentDate,input.paymentMethod,input.reference,input.amount,source.currency,receiptStatus,input.accountId])
    const journalId = await postReceipt(db,{companyId,userId,id,date:input.paymentDate,amount:input.amount,currency:source.currency,reference:input.reference || 'INV-'+state.bill.invoice_number,
      lines:[{accountId:input.accountId,side:'DEBIT',parties},{accountId:receivableId,side:'CREDIT',parties}]})
    const outstanding = (moneyCents(state.outstanding) - moneyCents(input.amount)) / 100
    await db.query(`UPDATE bills SET payment_status=$3::"PaymentStatus",updated_at=now() WHERE id=$1 AND company_id=$2`, [input.billId,companyId,outstanding === 0 ? 'PAID' : 'PENDING'])
    return { success:true,receiptId:id,journalId,outstanding,paymentStatus:outstanding === 0 ? 'PAID' : 'PENDING' }
  })
}

export async function reverseBillReceipt(db: Db, companyId: string, userId: string, body: any) {
  let input
  try { input = receiptInput({...body,amount:1,paymentMethod:'Cash',accountId:'reversal'}) }
  catch (e: any) { throw createError({statusCode:400,statusMessage:e.message}) }
  if (typeof body.receiptId !== 'string' || !body.receiptId) throw createError({statusCode:400,statusMessage:'Select a receipt'})
  return saveSourceRequest(db,companyId,userId,'bill-credit-reversal',body.requestId,{billId:input.billId,receiptId:body.receiptId,paymentDate:input.paymentDate,reference:input.reference},async () => {
    const state = await receiptBill(db,companyId,input.billId,true)
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['accountant-v2:'+companyId])
    const receipt = state.payments.find((p: any) => p.id === body.receiptId && p.status === receiptStatus && !p.deleted)
    if (!receipt?.journal_id) throw fail('Receipt is missing or already reversed')
    if (new Date(input.paymentDate) < new Date(receipt.payment_date)) throw fail('Reversal cannot precede the receipt')
    await dateUnlocked(db,companyId,input.paymentDate)
    const journal = (await db.query('SELECT * FROM accountant_v2_manual_journals WHERE id=$1 AND company_id=$2', [receipt.journal_id,companyId])).rows[0]
    const lines = (await db.query(`SELECT account_id AS "accountId",side,source_parties AS parties FROM accountant_v2_manual_journal_lines
      WHERE journal_id=$1 AND company_id=$2 AND deleted_at IS NULL`, [receipt.journal_id,companyId])).rows
    if (lines.length !== 2 || journal.status !== 'PUBLISHED' || journal.deleted_at) throw fail('Receipt journal needs accounting review')
    const journalId = await postReceipt(db,{companyId,userId,id:receipt.id,date:input.paymentDate,amount:receipt.amount,currency:journal.currency,reference:input.reference || journal.reference_number,reversedFrom:journal.id,
      lines:lines.map((l: any) => ({...l,side:l.side === 'DEBIT' ? 'CREDIT' : 'DEBIT'}))})
    await db.query('UPDATE payments SET status=$3,updated_at=now() WHERE id=$1 AND company_id=$2', [receipt.id,companyId,reversedReceiptStatus])
    await db.query(`UPDATE bills SET payment_status='PENDING',updated_at=now() WHERE id=$1 AND company_id=$2`, [input.billId,companyId])
    return {success:true,receiptId:receipt.id,journalId,outstanding:(moneyCents(state.outstanding)+moneyCents(receipt.amount))/100}
  })
}
