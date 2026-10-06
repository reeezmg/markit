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
const expenseFind = prisma.expense.findUnique.bind(prisma.expense);
const billFind = prisma.bill.findUnique.bind(prisma.bill);
let depth = 0;
let assertLegacyUnchanged: (() => Promise<void>) | undefined;
const ownBills = new Set<string>(), ownExpenses = new Set<string>();
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
  // Keep the archive guard isolated from unrelated live application commits.
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get('schema') || 'public';
  assert.match(schema, /^[A-Za-z_][A-Za-z0-9_]*$/);
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  assertLegacyUnchanged = await legacyLedgerGuard(db);
  await db.query("SET LOCAL lock_timeout='5s'");
  const {rows:[f]} = await db.query(`SELECT s.company_id, s.accounts,
    (SELECT user_id FROM company_users WHERE company_id=s.company_id AND NOT deleted LIMIT 1) AS user_id,
    (SELECT client_id FROM company_clients WHERE company_id=s.company_id LIMIT 1) AS client_id,
    (SELECT id FROM categories WHERE company_id=s.company_id LIMIT 1) AS category_id,
    (SELECT id FROM expense_categories WHERE company_id=s.company_id LIMIT 1) AS expense_category_id
    FROM accountant_v2_erp_settings s WHERE s.enabled ORDER BY s.company_id LIMIT 1`);
  assert.ok(f?.user_id && f.client_id && f.category_id && f.expense_category_id, 'An enabled company with staff, client and categories is required');
  const session = {data:{id:f.user_id,companyId:f.company_id,role:'manager'}};
  Object.assign(globalThis,{createError,defineEventHandler,getHeader,getQuery,getRequestURL,readBody,
    requireAuthSession:async()=>session,useAuthSession:async()=>session});
  (pool as any).connect=async()=>({query,release(){}});
  (pool as any).query=query;
  // Ownership checks must see uncommitted fixtures on the same transaction connection.
  (prisma.expense as any).findUnique=async(args:any)=>ownExpenses.has(args.where.id)
    ? (await db.query('SELECT company_id AS "companyId" FROM expenses WHERE id=$1',[args.where.id])).rows[0] ?? null : expenseFind(args);
  (prisma.bill as any).findUnique=async(args:any)=>ownBills.has(args.where.id)
    ? (await db.query('SELECT company_id AS "companyId" FROM bills WHERE id=$1',[args.where.id])).rows[0] ?? null : billFind(args);
  const middleware=(await import('../server/middleware/company-request')).default;
  const createBill=(await import('../server/api/bill/create.post')).default;
  const updateBill=(await import('../server/api/bill/update.post')).default;
  const settleBill=(await import('../server/api/billSale/updatePaymentStatus.post')).default;
  const deleteBill=(await import('../server/api/billSale/deleteBill.post')).default;
  const restoreBill=(await import('../server/api/billSale/restoreBill.post')).default;
  const createExpense=(await import('../server/api/accounts/expenses.post')).default;
  const updateExpense=(await import('../server/api/accounts/expenses/[id].put')).default;
  const deleteExpense=(await import('../server/api/accounts/expenses/[id].delete')).default;
  const expenseStatus=(await import('../server/api/accounts/expenses/status.post')).default;
  async function call(handler:any,method:string,path:string,body:any={},id?:string) {
    const json=JSON.stringify(body), req=Readable.from([Buffer.from(json)]) as any;
    req.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(json)),'x-company-id':f.company_id};
    req.method=method;req.url=path;
    const event=createEvent(req,{} as any);
    event.context.authorizedCompanyIds=Promise.resolve([f.company_id]);
    event.context.params=id?{id}:{};
    await middleware(event);
    return handler(event);
  }
  async function lines(key:string) {
    return (await db.query(`SELECT l.*,a.account_type FROM accountant_v2_erp_sources s
      JOIN accountant_v2_manual_journal_lines l ON l.journal_id=s.journal_id
      JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id
      WHERE s.company_id=$1 AND s.source_key=$2`,[f.company_id,key])).rows;
  }
  async function expect(key:string,expected:Record<string,number>) {
    const rows=await lines(key), totals:Record<string,number>={};
    for(const l of rows) totals[l.account_type]=(totals[l.account_type]||0)+(l.side==='DEBIT'?1:-1)*Number(l.amount);
    assert.deepEqual(totals,expected,key);
    assert.equal(Object.values(totals).reduce((a,b)=>a+b,0),0,'Debits equal credits');
    return rows;
  }
  const id=randomUUID();ownBills.add(id);
  const date=new Date().toISOString();
  const item={name:'ERP accounting API test',qty:1,rate:118,value:118,discount:0,tax:18,return:false,category:{connect:{id:f.category_id}}};
  const body={uuid:id,companyId:f.company_id,userId:f.user_id,billPoints:0,returnedItems:[],items:[],payload:{
    subtotal:118,grandTotal:118,discount:0,discountType:'percentage',returnAmt:0,paymentMethod:'Cash',paymentStatus:'PAID',type:'BILL',createdAt:date,
    company:{connect:{id:f.company_id}},client:{connect:{id:f.client_id}},
    companyUser:{connect:{companyId_userId:{companyId:f.company_id,userId:f.user_id}}},entries:{create:[item]}}};
  assert.equal((await call(createBill,'POST','/api/bill/create',body)).billId,id);
  const key=`bill:${id}`;
  const initial=await expect(key,{CASH:118,INCOME:-100,OTHER_CURRENT_LIABILITY:-18});
  assert.equal(initial[0].source_parties.client.id,f.client_id);assert.equal(initial[0].source_parties.user.id,f.user_id);
  const before=(await db.query('SELECT revision FROM accountant_v2_erp_sources WHERE company_id=$1 AND source_key=$2',[f.company_id,key])).rows[0].revision;
  const replay=await call(createBill,'POST','/api/bill/create',body);
  assert.equal(replay.billId,id);
  await assert.rejects(call(createBill,'POST','/api/bill/create',{...body,payload:{...body.payload,grandTotal:999}}), /different details/);
  assert.equal((await db.query('SELECT revision FROM accountant_v2_erp_sources WHERE company_id=$1 AND source_key=$2',[f.company_id,key])).rows[0].revision,before,'Retry creates no duplicate journal');
  const billData={id,companyId:f.company_id,clientId:f.client_id,subtotal:118,grandTotal:118,discount:0,paymentMethod:'Credit',paymentStatus:'PENDING',date,creditUserId:f.user_id};
  await call(updateBill,'POST','/api/bill/update',{billData,items:[],entriesToDelete:[]});
  await expect(key,{ACCOUNTS_RECEIVABLE:118,INCOME:-100,OTHER_CURRENT_LIABILITY:-18});
  const invoiceDate=(await db.query('SELECT created_at::text AS date FROM bills WHERE id=$1',[id])).rows[0].date;
  await call(settleBill,'POST','/api/billSale/updatePaymentStatus',{billId:id,companyId:f.company_id,status:'PAID',paymentMethod:'Cash'});
  await expect(key,{CASH:118,INCOME:-100,OTHER_CURRENT_LIABILITY:-18});
  assert.equal((await db.query('SELECT created_at::text AS date FROM bills WHERE id=$1',[id])).rows[0].date,invoiceDate,'Payment preserves invoice date');

  await call(updateBill,'POST','/api/bill/update',{billData:{...billData,paymentMethod:'Split',paymentStatus:'PAID',creditUserId:null,splitPayments:[{method:'Cash',amount:50},{method:'UPI',amount:68}]},items:[],entriesToDelete:[]});
  await expect(key,{CASH:50,BANK:68,INCOME:-100,OTHER_CURRENT_LIABILITY:-18});
  await call(updateBill,'POST','/api/bill/update',{billData:{...billData,paymentMethod:'Split',paymentStatus:'PENDING',creditUserId:null,splitPayments:[{method:'Cash',amount:50},{method:'Credit',amount:68}]},items:[],entriesToDelete:[]});
  await call(settleBill,'POST','/api/billSale/updatePaymentStatus',{billId:id,companyId:f.company_id,status:'PAID',paymentMethod:'UPI'});
  await expect(key,{CASH:50,BANK:68,INCOME:-100,OTHER_CURRENT_LIABILITY:-18});

  await call(deleteBill,'POST','/api/billSale/deleteBill',{billId:id,companyId:f.company_id});
  assert.equal((await lines(key)).length,0,'Deleted sale is reversed');
  await call(restoreBill,'POST','/api/billSale/restoreBill',{billId:id,companyId:f.company_id});
  await expect(key,{CASH:50,BANK:68,INCOME:-100,OTHER_CURRENT_LIABILITY:-18});
  await call(deleteBill,'POST','/api/billSale/deleteBill',{billId:id,companyId:f.company_id});
  assert.equal((await lines(key)).length,0,'Restored sale can be deleted and reversed again');
  console.log('PASS actual billing handlers: cash + tax, linked client/user, idempotent retry and changed-request rejection, employee credit, split settlement, deletion/reversal');
  const expenseBody={companyId:f.company_id,userId:f.user_id,expensecategoryId:f.expense_category_id,expenseDate:date,totalAmount:118,taxAmount:18,recoverableTaxAmount:8,status:'Pending',paymentMode:'CASH',note:'ERP accounting API test'};
  const result=await call(createExpense,'POST','/api/accounts/expenses',expenseBody);
  ownExpenses.add(result.id);const expenseKey=`expense:${result.id}`;
  const expenseLines=await expect(expenseKey,{EXPENSE:110,OTHER_CURRENT_ASSET:8,OTHER_CURRENT_LIABILITY:-118});
  assert.equal(expenseLines[0].source_parties.user.id,f.user_id);
  await call(updateExpense,'PUT',`/api/accounts/expenses/${result.id}`,{...expenseBody,status:'Paid',paymentMode:'BANK'},result.id);
  await expect(expenseKey,{EXPENSE:110,OTHER_CURRENT_ASSET:8,BANK:-118});
  assert.equal((await call(expenseStatus,'POST','/api/accounts/expenses/status',{ids:[result.id],status:'Pending'})).count,1);
  await expect(expenseKey,{EXPENSE:110,OTHER_CURRENT_ASSET:8,OTHER_CURRENT_LIABILITY:-118});
  await call(expenseStatus,'POST','/api/accounts/expenses/status',{ids:[result.id],status:'Paid'});
  await expect(expenseKey,{EXPENSE:110,OTHER_CURRENT_ASSET:8,BANK:-118});
  await assert.rejects(call(updateExpense,'PUT',`/api/accounts/expenses/${result.id}`,{...expenseBody,recoverableTaxAmount:19},result.id));
  await expect(expenseKey,{EXPENSE:110,OTHER_CURRENT_ASSET:8,BANK:-118});
  await call(deleteExpense,'DELETE',`/api/accounts/expenses/${result.id}`,{},result.id);
  assert.equal((await lines(expenseKey)).length,0,'Deleted expense is reversed');
  // All journals belonging to these two sources, including reversals, net to zero.
  const net=await db.query(`SELECT l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) n
    FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id
    WHERE j.company_id=$1 AND (j.source_id LIKE $2 OR j.source_id LIKE $3 OR j.reversed_from_id IN
    (SELECT id FROM accountant_v2_manual_journals WHERE company_id=$1 AND (source_id LIKE $2 OR source_id LIKE $3)))
    GROUP BY l.account_id HAVING sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)<>0`,[f.company_id,key+':%',expenseKey+':%']);
  assert.equal(net.rowCount,0,'Deleting the test sources leaves no net account movements');
  console.log('PASS actual expense handlers: partial tax, user link, unpaid to bank-paid, invalid-tax rejection, deletion/reversal; all net movements zero');
} finally {
  (pool as any).connect=originalConnect;(pool as any).query=originalQuery;
  (prisma.expense as any).findUnique=expenseFind;(prisma.bill as any).findUnique=billFind;
  await db.query('ROLLBACK');db.release();await pool.end();await prisma.$disconnect();
  console.log('Rolled back all API test records, journals and counters.');
}
