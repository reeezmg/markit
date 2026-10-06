import { legacyLedgerGuard } from './legacy-ledger-guard';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createError, createEvent, defineEventHandler, getHeader, getQuery, getRequestURL, readBody } from 'h3';
import { pool } from '../server/db';
import { prisma } from '../server/prisma';

// Exercise real handlers + installed triggers. All writes, counters and journals roll back.
// Auth is supplied by the harness; this does not test browser login.
const db = await pool.connect();
const originalConnect = pool.connect.bind(pool);
const originalQuery = pool.query.bind(pool);
const restores: (()=>void)[]=[];
const fixtureIds=new Set<string>();
let depth = 0;
let assertLegacyUnchanged: (() => Promise<void>) | undefined;
const query = async (text: any, args?: any[]) => {
  const command = typeof text === 'string' ? text.trim().toUpperCase() : '';
  if (command === 'BEGIN') return db.query(`SAVEPOINT api_${++depth}`);
  if (command === 'COMMIT') {
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query('SET CONSTRAINTS ALL DEFERRED');
    await assertLegacyUnchanged?.();
    return db.query(`RELEASE SAVEPOINT api_${depth--}`);
  }
  if (command === 'ROLLBACK') {
    if (!depth) return { rows: [], rowCount: 0 };
    const name = `api_${depth--}`;
    await db.query(`ROLLBACK TO SAVEPOINT ${name}`);
    return db.query(`RELEASE SAVEPOINT ${name}`);
  }
  return db.query(text, args);
};
try {
 // Observe our own writes while excluding unrelated live application commits from the archive guard.
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 const schema=new URL(process.env.DATABASE_URL!).searchParams.get('schema')||'public';assert.match(schema,/^[A-Za-z_][A-Za-z0-9_]*$/);
 await db.query(`SET LOCAL search_path TO "${schema}"`);
 assertLegacyUnchanged = await legacyLedgerGuard(db);
 const {rows:[f]}=await db.query(`SELECT s.company_id,s.accounts,(SELECT user_id FROM company_users WHERE company_id=s.company_id AND NOT deleted LIMIT 1) user_id FROM accountant_v2_user_settings s WHERE enabled ORDER BY company_id LIMIT 1`);
 assert.ok(f?.user_id,'Enable staff accounting before this rollback-only API test');
 const session={data:{id:f.user_id,companyId:f.company_id,role:'manager'}};
 Object.assign(globalThis,{createError,defineEventHandler,getHeader,getQuery,getRequestURL,readBody,requireAuthSession:async()=>session});
 (pool as any).connect=async()=>({query,release(){}});(pool as any).query=query;
 const call=async(handler:any,method:string,path:string,body:any={},id?:string)=>{
  const json=JSON.stringify(body),req=Readable.from([Buffer.from(json)]) as any;
  req.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(json)),'x-company-id':f.company_id};req.method=method;req.url=path;
  const event=createEvent(req,{} as any);event.context.authorizedCompanyIds=Promise.resolve([f.company_id]);event.context.params=id?{id}:{};return handler(event);
 };
 const createPay=(await import('../server/api/salary/pay.post')).default;
 const editPay=(await import('../server/api/salary/payment/[id].put')).default;
 const deletePay=(await import('../server/api/salary/payment/[id].delete')).default;
 const createCredit=(await import('../server/api/users/credit-ledger.post')).default;
 const editCredit=(await import('../server/api/users/credit-ledger/[id].put')).default;
 const deleteCredit=(await import('../server/api/users/credit-ledger/[id].delete')).default;
 const baseline=(await db.query('SELECT id FROM accountant_v2_manual_journals WHERE company_id=$1',[f.company_id])).rows.map(r=>r.id);
 const balance=async(role:string)=>Number((await db.query(`SELECT COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0) n FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id WHERE l.company_id=$1 AND l.account_id=$2 AND NOT(j.id=ANY($3::text[])) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL`,[f.company_id,f.accounts[role],baseline])).rows[0].n);
 const day=new Date().toISOString().slice(0,10);
 const payment=await call(createPay,'POST','/api/salary/pay',{userId:f.user_id,amount:100,paymentMode:'CASH',paymentDate:day});
 assert.equal(await balance('cash'),-100);assert.equal(await balance('salaryPayable'),100);
 await call(editPay,'PUT',`/api/salary/payment/${payment.paymentId}`,{amount:150,paymentMode:'BANK',paymentDate:day},payment.paymentId);
 assert.equal(await balance('cash'),0);assert.equal(await balance('bank'),-150);assert.equal(await balance('salaryPayable'),150);
 await call(deletePay,'DELETE',`/api/salary/payment/${payment.paymentId}`,{},payment.paymentId);
 assert.equal(await balance('bank'),0);assert.equal(await balance('salaryPayable'),0);

 const nativeBank=randomUUID();
 await db.query(`INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,account_type,category,updated_at) VALUES($1,$2,'Native salary bank rollback fixture','BANK','ASSET',now())`,[nativeBank,f.company_id]);
 const nativeBalance=async()=>Number((await db.query(`SELECT COALESCE(sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END),0) n FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND account_id=$2`,[f.company_id,nativeBank])).rows[0].n);
 const selected=await call(createPay,'POST','/api/salary/pay',{userId:f.user_id,amount:75,paymentMode:'BANK',bankAccountId:nativeBank,paymentDate:day});
 assert.equal(await nativeBalance(),-75,'Native bank receives the salary credit');
 assert.equal((await db.query('SELECT bank_account_id FROM salary_payments WHERE id=$1',[selected.paymentId])).rows[0].bank_account_id,null,'New payout never links an old bank');
 assert.equal((await db.query('SELECT account_id FROM money_transactions WHERE id=$1',[selected.moneyTransactionId])).rows[0].account_id,null);
 await call(editPay,'PUT',`/api/salary/payment/${selected.paymentId}`,{amount:90,paymentMode:'BANK',paymentDate:day},selected.paymentId);
 assert.equal(await nativeBalance(),-90,'An amount edit retains the recorded native bank');
 const paymentOptions=(await import('../server/api/salary/payment-options.get')).default;
 const options=await call(paymentOptions,'GET',`/api/salary/payment-options?paymentId=${selected.paymentId}`);
 assert.equal(options.selectedBankId,nativeBank);
 assert.ok(options.banks.some((b:any)=>b.id===nativeBank));
 await assert.rejects(call(editPay,'PUT',`/api/salary/payment/${selected.paymentId}`,{amount:90,paymentMode:'BANK',bankAccountId:f.accounts.cash,paymentDate:day},selected.paymentId),{statusCode:403});
 await db.query('UPDATE accountant_v2_accounting_accounts SET is_active=false WHERE id=$1',[nativeBank]);
 await assert.rejects(call(editPay,'PUT',`/api/salary/payment/${selected.paymentId}`,{amount:90,paymentMode:'BANK',bankAccountId:nativeBank,paymentDate:day},selected.paymentId),{statusCode:403});
 await db.query('UPDATE accountant_v2_accounting_accounts SET is_active=true WHERE id=$1',[nativeBank]);
 await assert.rejects(call(editPay,'PUT',`/api/salary/payment/${selected.paymentId}`,{amount:90,paymentMode:'BANK',bankAccountId:'missing-bank',paymentDate:day},selected.paymentId),{statusCode:403});
 assert.equal(await nativeBalance(),-90,'Invalid account edit is rolled back');
 await call(deletePay,'DELETE',`/api/salary/payment/${selected.paymentId}`,{},selected.paymentId);
 assert.equal(await nativeBalance(),0,'Native bank payout reverses on deletion');
 const creditBody={userId:f.user_id,type:'CREDIT',amount:100,paymentMode:'CASH',transactionDate:day};
 const credit=await call(createCredit,'POST','/api/users/credit-ledger',creditBody);
 assert.equal(await balance('cash'),-100);assert.equal(await balance('receivable'),100);
 await call(editCredit,'PUT',`/api/users/credit-ledger/${credit.id}`,{...creditBody,amount:125,paymentMode:'BANK'},credit.id);
 assert.equal(await balance('cash'),0);assert.equal(await balance('bank'),-125);assert.equal(await balance('receivable'),125);
 const repayment=await call(createCredit,'POST','/api/users/credit-ledger',{...creditBody,type:'PAYMENT',amount:25});
 assert.equal(await balance('cash'),25);assert.equal(await balance('receivable'),100);
 const ledger=(await import('../server/api/users/ledger.get')).default;
 const users=await call(ledger,'GET','/api/users/ledger');const entries=users.find((u:any)=>u.userId===f.user_id).entries;
 assert.ok(entries.find((e:any)=>e.id===credit.id).journalId);assert.equal(entries.find((e:any)=>e.id===credit.id).accountingLines.length,2);
 await call(deleteCredit,'DELETE',`/api/users/credit-ledger/${repayment.id}`,{},repayment.id);
 await call(deleteCredit,'DELETE',`/api/users/credit-ledger/${credit.id}`,{},credit.id);
 for(const role of ['cash','bank','receivable','salaryPayable'])assert.equal(await balance(role),0);
 // Mixed cash + credit payroll settlements keep both operational and GL dues correct.
 const cycleId=randomUUID(),lineId=randomUUID();
 await db.query(`INSERT INTO payroll_cycles(id,company_id,month,year,payment_date,period_start,period_end,updated_at) VALUES($1,$2,9,2026,$3,$3,$3,now())`,[cycleId,f.company_id,day]);
 await db.query(`INSERT INTO payroll_cycle_lines(id,company_id,cycle_id,user_id,net_pay) VALUES($1,$2,$3,$4,1000)`,[lineId,f.company_id,cycleId,f.user_id]);
 const {upsertUserLedgerEntry}=await import('../server/utils/user-ledger');
 const operationalBefore=Number((await db.query(`SELECT COALESCE(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END),0) n FROM user_ledger_entries WHERE company_id=$1 AND user_id=$2`,[f.company_id,f.user_id])).rows[0].n);
 await upsertUserLedgerEntry({query},{companyId:f.company_id,userId:f.user_id,type:'PAYROLL_ACCRUAL',direction:'CREDIT',amount:1000,sourceType:'PAYROLL_CYCLE',sourceId:`${cycleId}:${f.user_id}`,createdAt:day});
 const loan=await call(createCredit,'POST','/api/users/credit-ledger',{...creditBody,amount:300});
 const payCut=(await import('../server/api/salary/pay-with-credit.post')).default;
 const mixed={userId:f.user_id,salaryAmount:600,creditCutAmount:200,paymentMode:'CASH',paymentDate:day,cycleId,cycleLineId:lineId};
 const one=await call(payCut,'POST','/api/salary/pay-with-credit',mixed);
 const two=await call(payCut,'POST','/api/salary/pay-with-credit',{...mixed,salaryAmount:100,creditCutAmount:50});
 assert.equal(await balance('cash'),-1000);assert.equal(await balance('receivable'),50);assert.equal(await balance('salaryPayable'),-50);
 await call(editPay,'PUT',`/api/salary/payment/${one.payment.paymentId}`,{amount:650,paymentMode:'CASH',paymentDate:day},one.payment.paymentId);
 const operational=async()=>Number((await db.query(`SELECT COALESCE(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END),0) n FROM user_ledger_entries WHERE company_id=$1 AND user_id=$2`,[f.company_id,f.user_id])).rows[0].n)-operationalBefore;
 assert.equal(await operational(),-50,'Editing one mixed payout retains only its own credit cut');
 assert.equal(await balance('salaryPayable'),0);assert.equal(await balance('cash'),-1050);
 await call(deletePay,'DELETE',`/api/salary/payment/${one.payment.paymentId}`,{},one.payment.paymentId);
 assert.equal(await operational(),600,'Deleting cash payout retains the separate noncash credit settlement');
 assert.equal(await balance('salaryPayable'),-650);assert.equal(await balance('receivable'),50);
 await call(deletePay,'DELETE',`/api/salary/payment/${two.payment.paymentId}`,{},two.payment.paymentId);
 const deleteCycle=(await import('../server/api/salary/payroll/cycle/[id].delete')).default;
 await call(deleteCycle,'DELETE',`/api/salary/payroll/cycle/${cycleId}`,{},cycleId);
 await call(deleteCredit,'DELETE',`/api/users/credit-ledger/${loan.id}`,{},loan.id);
 for(const role of ['cash','bank','receivable','salaryPayable','salaryExpense'])assert.equal(await balance(role),0);
 assert.equal(await operational(),0,'Cycle and payout cleanup restores source balance');
 console.log('Real staff API handlers passed: salary create/edit/delete, credit create/edit/delete, repayment, accounting balances and user-ledger journal rendering. All fixture writes rolled back.');
}finally{
 (pool as any).connect=originalConnect;(pool as any).query=originalQuery;
 await db.query('ROLLBACK');db.release();await prisma.$disconnect();await pool.end();
}
