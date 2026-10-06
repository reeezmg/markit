import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recordBillReceipt, reverseBillReceipt, assertNoBillReceipts } from '../server/utils/bill-receipts'
import { billOutstanding, billCreditCents, moneyCents, receiptStatus, reversedReceiptStatus, receiptInput, preserveCreditTender } from '../utils/bill-credit'

// Transaction-aware in-memory adapter executes the real service and captures its
// journals. No connection, source record or database schema is changed.
function fixture(split = false) {
  let state: any = {
    bill:{id:'bill',company_id:'company',grand_total:1000,payment_method:split?'Split':'Credit',split_payments:split?[{method:'Cash',amount:400},{method:'Credit',amount:600}]:null,
      payment_status:'PENDING',created_at:'2026-10-01T04:30:00Z',type:'BILL',invoice_number:1,client_id:'client'},
    payments:[],journals:[],lines:[],audits:new Map(),locked:false,excluded:false,accounts:{cash:'CASH',bank:'BANK'},
  }
  const calls: any[]=[]
  const db={async query(sql:string,args:any[]=[]):Promise<any>{
    calls.push({sql,args});const rows=(rows:any[])=>({rows,rowCount:rows.length})
    if(sql.includes('pg_advisory_xact_lock'))return rows([])
    if(sql.startsWith('SELECT "after"'))return rows(state.audits.has(args[0])?[{after:state.audits.get(args[0])}]:[])
    if(sql.startsWith('INSERT INTO accountant_v2_accountant_audit')){state.audits.set(args[0],JSON.parse(args[5]));return rows([])}
    if(sql.startsWith('SELECT * FROM bills'))return rows(args[0]===state.bill.id && args[1]===state.bill.company_id?[{...state.bill}]:[])
    if(sql.startsWith('SELECT p.*, j.id'))return rows(state.payments.filter((p:any)=>p.company_id===args[0] && p.bill_id===args[1]).map((p:any)=>({...p,journal_id:state.journals.find((j:any)=>j.source_type==='ERP_CREDIT_RECEIPT' && j.source_id===p.id)?.id})))
    if(sql.startsWith('SELECT id FROM payments'))return rows(state.payments.filter((p:any)=>p.company_id===args[0] && p.bill_id===args[1] && args[2].includes(p.status) && !p.deleted).slice(0,1))
    if(sql.startsWith('SELECT reason'))return rows(state.locked?[{reason:'Closed'}]:[])
    if(sql.startsWith('SELECT s.*, j.currency'))return rows([{journal_id:'sale',signature:{excluded:state.excluded},accounts:{receivable:'ar'},currency:'INR',journal_status:'PUBLISHED'}])
    if(sql.startsWith('SELECT sum(l.amount)'))return rows([{amount:state.postedAmount ?? billCreditCents(state.bill)/100,source_parties:{creditAccount:{id:'customer',name:'Customer'}}}])
    if(sql.startsWith('SELECT id FROM accountant_v2_accounting_accounts'))return rows(state.accounts[args[0]]===args[2] && args[1]==='company'?[{id:args[0]}]:[])
    if(sql.startsWith('INSERT INTO payments')){state.payments.push({id:args[0],company_id:args[1],bill_id:args[2],client_id:args[3],payment_date:args[4],payment_mode:args[5],payment_reference:args[6],amount:args[7],currency:args[8],status:args[9],deposit_to:args[10],deleted:false});return rows([])}
    if(sql.startsWith('INSERT INTO accountant_v2_manual_journals')){state.journals.push({id:args[0],company_id:args[1],journal_date:args[3],reference_number:args[4],currency:args[6],total:args[7],source_type:args[8],source_id:args[9],reversed_from_id:args[10],status:'PUBLISHED'});return rows([])}
    if(sql.startsWith('INSERT INTO accountant_v2_manual_journal_lines')){state.lines.push({id:args[0],company_id:args[1],journal_id:args[2],accountId:args[3],side:args[4],amount:args[5],parties:JSON.parse(args[7])});return rows([])}
    if(sql.startsWith('UPDATE bills')){state.bill.payment_status=args[2] || 'PENDING';return rows([])}
    if(sql.startsWith('SELECT * FROM accountant_v2_manual_journals'))return rows(state.journals.filter((j:any)=>j.id===args[0] && j.company_id===args[1]))
    if(sql.startsWith('SELECT account_id'))return rows(state.lines.filter((l:any)=>l.journal_id===args[0] && l.company_id===args[1]))
    if(sql.startsWith('UPDATE payments')){state.payments.find((p:any)=>p.id===args[0] && p.company_id===args[1]).status=args[2];return rows([])}
    throw Error('Unmocked query: '+sql)
  }}
  return {db,calls,get state(){return state},async transaction(fn:()=>Promise<any>){const backup=structuredClone(state);try{return await fn()}catch(e){state=backup;throw e}}}
}
const input = (amount:number, requestId='receipt-1') => ({billId:'bill',amount,paymentMethod:'UPI',accountId:'bank',paymentDate:'2026-10-05',requestId})

test('partial and full collections preserve the original sale, method, date and customer',async()=>{
  const f=fixture();const original={...f.state.bill}
  const partial=await f.transaction(()=>recordBillReceipt(f.db,'company','user',input(400)))
  assert.equal(partial.outstanding,600);assert.equal(f.state.bill.payment_status,'PENDING')
  assert.equal(billOutstanding({...f.state.bill,payments:f.state.payments}),600)
  const full=await f.transaction(()=>recordBillReceipt(f.db,'company','user',input(600,'receipt-2')))
  assert.equal(full.outstanding,0);assert.equal(f.state.bill.payment_status,'PAID')
  assert.deepEqual({...f.state.bill,payment_status:original.payment_status},original)
  assert.equal(f.state.journals.length,2)
  assert.ok(f.state.journals.every((j:any)=>j.journal_date==='2026-10-04T18:30:00.000Z' && j.source_type==='ERP_CREDIT_RECEIPT'))
  assert.deepEqual(f.state.lines.map((l:any)=>[l.accountId,l.side,l.amount]),[['bank','DEBIT',400],['ar','CREDIT',400],['bank','DEBIT',600],['ar','CREDIT',600]])
  assert.ok(f.state.lines.every((l:any)=>l.parties.creditAccount.id==='customer'))
  assert.ok(f.calls.find((c:any)=>c.sql.startsWith('SELECT * FROM bills')).sql.includes('FOR UPDATE'))
  await assert.rejects(recordBillReceipt(f.db,'company','user',input(1,'over')),/already paid/)
})

test('split credit collections retain all original payment portions',async()=>{
  const f=fixture(true), original=structuredClone(f.state.bill.split_payments)
  const result=await recordBillReceipt(f.db,'company','user',input(600))
  assert.equal(result.outstanding,0);assert.equal(f.state.bill.payment_method,'Split')
  assert.deepEqual(f.state.bill.split_payments,original)
  assert.equal(f.state.lines.reduce((n:number,l:any)=>n+(l.side==='DEBIT'?l.amount:-l.amount),0),0)
})

test('retry returns original receipt; changed payload and overpayment reject',async()=>{
  const f=fixture()
  const first=await recordBillReceipt(f.db,'company','user',input(400))
  assert.deepEqual(await recordBillReceipt(f.db,'company','user',input(400)),first)
  assert.equal(f.state.payments.length,1)
  await assert.rejects(recordBillReceipt(f.db,'company','user',input(401)),/different details/)
  await assert.rejects(recordBillReceipt(f.db,'company','user',input(601,'another')),/exceeds/)
  assert.equal(f.state.payments.length,1)
})

test('dated reversal retains original receipt and journal, reopens the due and retries safely',async()=>{
  const f=fixture(), paid=await recordBillReceipt(f.db,'company','user',input(1000))
  const body={billId:'bill',receiptId:paid.receiptId,paymentDate:'2026-10-06',requestId:'reversal-1'}
  const result=await reverseBillReceipt(f.db,'company','user',body)
  assert.equal(result.outstanding,1000);assert.equal(f.state.bill.payment_status,'PENDING')
  assert.equal(f.state.payments[0].status,reversedReceiptStatus)
  assert.equal(f.state.journals[1].reversed_from_id,paid.journalId)
  assert.equal(f.state.journals[1].journal_date,'2026-10-05T18:30:00.000Z')
  assert.deepEqual(f.state.lines.slice(2).map((l:any)=>[l.accountId,l.side]),[['bank','CREDIT'],['ar','DEBIT']])
  assert.deepEqual(await reverseBillReceipt(f.db,'company','user',body),result)
  assert.equal(f.state.journals.length,2)
  await assert.rejects(reverseBillReceipt(f.db,'company','user',{...body,requestId:'reversal-2'}),/already reversed/)
  await assertNoBillReceipts(f.db,'company','bill')
  await assert.rejects(assertNoBillReceipts(f.db,'company','bill',true),/Reverse/)
})

test('tenant, date, account, locked-period and excluded-history validation leave sources untouched',async()=>{
  for(const [mutate,body,company,message] of [
    [()=>{},input(400),'foreign',/not found/],
    [()=>{}, {...input(400),paymentDate:'2026-09-30'},'company',/precede/],
    [()=>{}, {...input(400),accountId:'cash'},'company',/matching/],
    [(s:any)=>s.locked=true,input(400),'company',/locked/],
    [(s:any)=>s.excluded=true,input(400),'company',/Review and post/],
    [(s:any)=>s.postedAmount=900,input(400),'company',/disagrees/],
    [(s:any)=>s.bill.credit_user_id='staff',input(400),'company',/Staff Accounting/],
  ] as any[]) {
    const f=fixture();mutate(f.state)
    await assert.rejects(f.transaction(()=>recordBillReceipt(f.db,company,'user',body)),message)
    assert.equal(f.state.payments.length,0);assert.equal(f.state.journals.length,0)
  }
})

test('failed journal write rolls the receipt back with the transaction',async()=>{
  const f=fixture(), query=f.db.query
  f.db.query=async(sql,args)=>{if(sql.startsWith('INSERT INTO accountant_v2_manual_journal_lines'))throw Error('Posting failed');return query(sql,args)}
  await assert.rejects(f.transaction(()=>recordBillReceipt(f.db,'company','user',input(400))),/Posting failed/)
  assert.equal(f.state.payments.length,0);assert.equal(f.state.journals.length,0);assert.equal(f.state.audits.size,0)
  assert.equal(f.state.bill.payment_status,'PENDING')
})

test('amount/date input rejects non-money, invalid calendars and invalid split totals',()=>{
  for(const amount of [NaN,Infinity,1.001,null,'',true,[100],{}]) assert.throws(()=>moneyCents(amount))
  assert.throws(()=>receiptInput({...input(1),paymentDate:'2026-02-30'}),/Invalid payment date/)
  assert.throws(()=>receiptInput({...input(1),paymentDate:'2026-02-30T00:00:00Z'}),/Invalid payment date/)
  assert.throws(()=>receiptInput({...input(1),paymentDate:'2026-10-05T10:00:00'}),/timezone/)
  assert.throws(()=>billCreditCents({grandTotal:100,paymentMethod:'Split',splitPayments:[{method:'Credit',amount:99}]}),/equal/)
  assert.equal(billOutstanding({grandTotal:100,paymentMethod:'Credit',payments:[{status:receiptStatus,amount:40},{status:reversedReceiptStatus,amount:20}]}),60)
})

test('invoice corrections cannot disguise a collection by changing paid portions',()=>{
  const original={paymentMethod:'Split',grandTotal:1000,splitPayments:[{method:'Cash',amount:400},{method:'Credit',amount:600}]}
  assert.throws(()=>preserveCreditTender(original,{...original,splitPayments:[{method:'Cash',amount:900},{method:'Credit',amount:100}]}),/dated receipt/)
  assert.throws(()=>preserveCreditTender({paymentMethod:'Credit',grandTotal:1000},{paymentMethod:'Cash',grandTotal:1000}),/dated receipt/)
  assert.doesNotThrow(()=>preserveCreditTender(original,{...original,grandTotal:900,splitPayments:[{method:'Cash',amount:400},{method:'Credit',amount:500}]}))
})
