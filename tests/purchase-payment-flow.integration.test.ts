import { legacyLedgerGuard } from './legacy-ledger-guard';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
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
const cases: string[] = [];
let passed = false;
let depth = 0;
let assertLegacyUnchanged: (() => Promise<void>) | undefined;
const query = async (text: any, args?: any[]) => {
  const command = typeof text === 'string' ? text.trim().toUpperCase() : '';
  if (/^(CREATE|ALTER|DROP|TRUNCATE)\b/.test(command)) throw Error('Schema changes are forbidden in this regression');
  if (command === 'BEGIN') return db.query(`SAVEPOINT api_${++depth}`);
  if (command === 'COMMIT') {
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query('SET CONSTRAINTS ALL DEFERRED');
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
  await db.query("SET LOCAL statement_timeout='60s'");
  const {rows:[f]} = await db.query(`SELECT s.company_id, s.accounts,
    (SELECT user_id FROM company_users WHERE company_id=s.company_id AND NOT deleted LIMIT 1) AS user_id,
    (SELECT client_id FROM company_clients WHERE company_id=s.company_id LIMIT 1) AS client_id,
    (SELECT id FROM categories WHERE company_id=s.company_id LIMIT 1) AS category_id,
    (SELECT distributor_id FROM accountant_v2_distributor_settings WHERE company_id=s.company_id AND enabled LIMIT 1) AS distributor_id,
    (SELECT id FROM expense_categories WHERE company_id=s.company_id LIMIT 1) AS expense_category_id
    FROM accountant_v2_erp_settings s WHERE s.enabled ORDER BY s.company_id LIMIT 1`);
  assert.ok(f?.distributor_id && f?.user_id && f.client_id && f.category_id && f.expense_category_id, 'An enabled company with staff, client and categories is required');
  assert.ok((await db.query('SELECT 1 FROM accountant_v2_stock_control WHERE company_id=$1 AND enabled AND initialized_at IS NOT NULL',[f.company_id])).rowCount, 'Use existing initialized stock control');
  await db.query('SELECT accountant_v2_sync_stock($1)',[f.company_id]);
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  await db.query('SET CONSTRAINTS ALL DEFERRED');
  const session = {data:{id:f.user_id,companyId:f.company_id,role:'manager'}};
  Object.assign(globalThis,{createError,defineEventHandler,getHeader,getQuery,getRequestURL,readBody,
    requireAuthSession:async()=>session,useAuthSession:async()=>session});
  (pool as any).connect=async()=>({query,release(){}});
  (pool as any).query=query;
  // Real company ownership checks read our uncommitted fixture records.
  for(const [model,table] of Object.entries({product:'products',variant:'variants',item:'items',purchaseOrder:'purchase_orders',purchaseReturn:'purchase_returns',bill:'bills'})) {
    const delegate=(prisma as any)[model], original=delegate.findUnique.bind(delegate);
    delegate.findUnique=async(args:any)=>fixtureIds.has(args.where.id)
      ? (await db.query(`SELECT company_id AS "companyId" FROM ${table} WHERE id=$1`,[args.where.id])).rows[0]??null : original(args);
    restores.push(()=>{delegate.findUnique=original;});
  }
  const middleware=(await import('../server/middleware/company-request')).default;
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
  const handlers=await Promise.all([
    import('../server/api/products/save-batch.post'),import('../server/api/products/update.post'),import('../server/api/products/delete.post'),
    import('../server/api/purchaseorder/update.post'),import('../server/api/purchasereturn/create.post'),import('../server/api/purchasereturn/update.put'),
    import('../server/api/purchasereturn/[id].delete'),import('../server/api/distributor/payments.post'),import('../server/api/distributor/payments/[id].put'),
    import('../server/api/distributor/payments/[id].delete'),import('../server/api/distributor/credits.post'),import('../server/api/distributor/credits/[id].put'),import('../server/api/distributor/credits/[id].delete')
  ]);
  const [batch,editProduct,deleteProduct,editPO,createReturn,editReturn,deleteReturn,createPay,editPay,deletePay,createCredit,editCredit,deleteCredit]=handlers.map(m=>m.default);
  const journalBaseline=(await db.query('SELECT id FROM accountant_v2_manual_journals WHERE company_id=$1',[f.company_id])).rows.map(r=>r.id);
  async function movement(expected:Record<string,number>,label:string){
    const rows=(await db.query(`SELECT a.account_type,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)::numeric(18,2) n
      FROM accountant_v2_manual_journals j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id
      JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id
      WHERE j.company_id=$1 AND NOT(j.id=ANY($2::text[])) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL
      GROUP BY a.account_type HAVING sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)<>0`,[f.company_id,journalBaseline])).rows;
    assert.deepEqual(Object.fromEntries(rows.map(r=>[r.account_type,Number(r.n)])),expected,label);
    assert.equal(Object.values(expected).reduce((a,b)=>a+b,0),0,label+' is balanced');
    cases.push(label);
    console.log('PASS '+label);
  }
  const date=new Date().toISOString(), productId=randomUUID(),variantId=randomUUID(),itemId=randomUUID();
  [productId,variantId,itemId].forEach(id=>fixtureIds.add(id));
  const product={id:productId,name:'Accounting rollback fixture',categoryId:f.category_id,variants:[{id:variantId,name:'Fixture',pprice:100,sprice:150,items:[{id:itemId,size:'M',qty:10}]}]};
  const purchase={distributorId:f.distributor_id,paymentType:'CREDIT',subTotalAmount:1000,totalAmount:1100,tax:10,discount:0,adjustment:0,createdAt:date};
  if (!process.argv.includes('--remaining-due-only')) {
  const created=await call(batch,'POST','/api/products/save-batch',{companyId:f.company_id,products:[product],po:purchase});
  const poId=created.poId;fixtureIds.add(poId);
  await movement({STOCK:1000,OTHER_CURRENT_ASSET:100,ACCOUNTS_PAYABLE:-1100},'create product + credit purchase');
  const productEdit={companyId:f.company_id,productId,product:{name:product.name,categoryId:f.category_id},variants:[{...product.variants[0],pprice:120}],syncPurchaseOrder:true,updateInitialQty:true};
  await call(editProduct,'POST','/api/products/update',productEdit);
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1320},'edit product purchase cost recalculates stock, tax and payable');
  const header={...purchase,subTotalAmount:1200,totalAmount:1320};
  await call(editPO,'POST','/api/purchaseorder/update',{companyId:f.company_id,poId,payment:{...header,paymentType:'CASH'}});
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,CASH:-1320},'purchase changes from credit to cash');
  await assert.rejects(call(editPO,'POST','/api/purchaseorder/update',{companyId:f.company_id,poId,payment:{...header,paymentType:'BANK'}}),/Edit payments separately/);
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,CASH:-1320},'unsafe PO payment rewrite is rejected without balance changes');
  const settlement=(await db.query('SELECT id FROM distributor_payments WHERE purchase_order_id=$1',[poId])).rows[0];
  await call(editPay,'PUT',`/api/distributor/payments/${settlement.id}`,{amount:1320,paymentType:'BANK',purchaseOrderId:poId,createdAt:date},settlement.id);
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,BANK:-1320},'edit purchase settlement from cash to bank');
  await call(deletePay,'DELETE',`/api/distributor/payments/${settlement.id}`,{},settlement.id);
  await call(editPO,'POST','/api/purchaseorder/update',{companyId:f.company_id,poId,payment:{...header,paymentType:'CREDIT'}});
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1320},'reverse settlement and restore credit purchase');
  const barcode=(await db.query('SELECT barcode FROM items WHERE id=$1',[itemId])).rows[0].barcode;
  const ret={companyId:f.company_id,distributorId:f.distributor_id,purchaseOrderId:poId,returnDate:date,subTotalAmount:120,taxAmount:12,totalAmount:132,items:[{itemId,variantId,barcode,productName:product.name,qty:1,rate:120,tax:10,taxAmount:12,subtotal:120,categoryId:f.category_id}]};
  const returned=await call(createReturn,'POST','/api/purchasereturn/create',ret);const returnId=returned.purchaseReturnId;fixtureIds.add(returnId);
  await movement({STOCK:1080,OTHER_CURRENT_ASSET:108,ACCOUNTS_PAYABLE:-1188},'purchase return reduces stock/tax/payable without bank movement');
  assert.equal((await db.query('SELECT qty FROM items WHERE id=$1',[itemId])).rows[0].qty,9);
  await call(editProduct,'POST','/api/products/update',productEdit);
  assert.equal((await db.query('SELECT qty FROM items WHERE id=$1',[itemId])).rows[0].qty,9,'Purchase edit must not restore supplier-returned stock');
  await movement({STOCK:1080,OTHER_CURRENT_ASSET:108,ACCOUNTS_PAYABLE:-1188},'purchase edit preserves supplier return stock and accounting');
  await call(editReturn,'PUT','/api/purchasereturn/update',{...ret,id:returnId,subTotalAmount:240,taxAmount:24,totalAmount:264,items:[{...ret.items[0],qty:2,taxAmount:24,subtotal:240}]});
  await movement({STOCK:960,OTHER_CURRENT_ASSET:96,ACCOUNTS_PAYABLE:-1056},'edit purchase return reverses and replaces');
  assert.equal((await db.query('SELECT qty FROM items WHERE id=$1',[itemId])).rows[0].qty,8);
  await call(deleteReturn,'DELETE',`/api/purchasereturn/${returnId}`,{},returnId);
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1320},'delete purchase return restores accounts');
  assert.equal((await db.query('SELECT qty FROM items WHERE id=$1',[itemId])).rows[0].qty,10);
  const payBody={companyId:f.company_id,distributorId:f.distributor_id,amount:200,paymentType:'CASH',createExpense:true,createdAt:date};
  const pay=await call(createPay,'POST','/api/distributor/payments',payBody);
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1120,CASH:-200},'linked distributor payment posts once, not as ERP expense');
  await call(editPay,'PUT',`/api/distributor/payments/${pay.id}`,{...payBody,amount:300,paymentType:'BANK'},pay.id);
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1020,BANK:-300},'edit distributor payment amount and bank');
  await call(deletePay,'DELETE',`/api/distributor/payments/${pay.id}`,{},pay.id);
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1320},'delete linked distributor payment');
  const creditBody={companyId:f.company_id,distributorId:f.distributor_id,amount:50,creditKind:'AMOUNT',paymentMode:'CASH',createdAt:date};
  const credit=await call(createCredit,'POST','/api/distributor/credits',creditBody);
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1370,CASH:50},'receive distributor money');
  await call(editCredit,'PUT',`/api/distributor/credits/${credit.id}`,{...creditBody,amount:80,paymentMode:'BANK'},credit.id);
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1400,BANK:80},'edit distributor receipt amount and bank');
  await call(deleteCredit,'DELETE',`/api/distributor/credits/${credit.id}`,{},credit.id);
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1320},'delete distributor receipt');
  const billId=randomUUID();fixtureIds.add(billId);
  // Seed the sale with the installed source function. The HTTP create wrapper
  // currently bootstraps DDL, which this test must never execute.
  const createBill=async(event:any)=>{
    const body=await readBody(event);
    await query('BEGIN');
    try { const r=await query('SELECT create_bill_source_plpgsql($1::jsonb) AS result',[JSON.stringify(body)]);await query('COMMIT');return r.rows[0].result; }
    catch(error){await query('ROLLBACK');throw error;}
  };
  const updateBill=(await import('../server/api/bill/update.post')).default;
  const deleteBill=(await import('../server/api/billSale/deleteBill.post')).default;
  await call(createBill,'POST','/api/bill/create',{uuid:billId,companyId:f.company_id,userId:f.user_id,billPoints:0,returnedItems:[],items:[{id:itemId,variantId,qty:1}],payload:{
    subtotal:150,grandTotal:150,discount:0,discountType:'percentage',returnAmt:0,paymentMethod:'Cash',paymentStatus:'PAID',type:'BILL',createdAt:date,
    company:{connect:{id:f.company_id}},entries:{create:[{name:product.name,qty:1,rate:150,value:150,discount:0,tax:0,return:false,category:{connect:{id:f.category_id}},variant:{connect:{id:variantId}},item:{connect:{id:itemId}}}]}}});
  await movement({STOCK:1080,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1320,CASH:150,INCOME:-150,COST_OF_GOODS_SOLD:120},'sell purchased stock: cash/revenue and stock/COGS both post');
  assert.equal((await db.query('SELECT qty FROM items WHERE id=$1',[itemId])).rows[0].qty,9);
  const assertStock = async (initial: number, sold: number, qty: number) => {
    const row = (await db.query('SELECT initial_qty, sold_qty, qty FROM items WHERE id=$1', [itemId])).rows[0];
    assert.deepEqual(row, { initial_qty: initial, sold_qty: sold, qty });
    assert.equal(row.qty, row.initial_qty - row.sold_qty);
  };
  // A purchase edit supplies purchased quantity, not available stock. Price-only
  // saves after a sale must retain the sold counter and must not replenish stock.
  await call(editProduct,'POST','/api/products/update',productEdit);
  await assertStock(10, 1, 9);
  await movement({STOCK:1080,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1320,CASH:150,INCOME:-150,COST_OF_GOODS_SOLD:120},'purchase edit after sale preserves remaining stock');
  await call(editProduct,'POST','/api/products/update',{...productEdit,updateInitialQty:false});
  await assertStock(10, 1, 9); // incoming qty=10 is stale; metadata saves ignore it
  await call(editProduct,'POST','/api/products/update',{...productEdit,variants:[{...productEdit.variants[0],items:[{id:itemId,size:'M',qty:12}]}]});
  await assertStock(12, 1, 11);
  await call(editProduct,'POST','/api/products/update',productEdit);
  await assertStock(10, 1, 9);
  // Current-stock adjustment flags cannot change counters. Only explicit
  // initial-quantity edits may change the baseline.
  const stockEdit={...productEdit,updateInitialQty:false,variants:[{...productEdit.variants[0],items:[{id:itemId,size:'M',qty:8,updateStockQty:true}]}]};
  await call(editProduct,'POST','/api/products/update',stockEdit);
  await assertStock(10, 1, 9);
  await call(editProduct,'POST','/api/products/update',{...stockEdit,variants:[{...productEdit.variants[0],items:[{id:itemId,size:'M',qty:999,initialQty:9,updateInitialQty:true,soldQty:0}]}]});
  await assertStock(9, 1, 8);
  await call(editProduct,'POST','/api/products/update',productEdit);
  await assertStock(10, 1, 9);
  const entryId=(await db.query('SELECT id FROM entries WHERE bill_id=$1',[billId])).rows[0].id;
  await call(updateBill,'POST','/api/bill/update',{billData:{id:billId,companyId:f.company_id,subtotal:300,grandTotal:300,discount:0,paymentMethod:'Cash',paymentStatus:'PAID',date},items:[{entryId,id:itemId,variantId,name:product.name,qty:2,rate:150,value:300,discount:0,tax:0,return:false,category:[{id:f.category_id}]}],entriesToDelete:[]});
  await movement({STOCK:960,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1320,CASH:300,INCOME:-300,COST_OF_GOODS_SOLD:240},'edit sold quantity updates revenue, COGS and stock');
  assert.equal((await db.query('SELECT qty FROM items WHERE id=$1',[itemId])).rows[0].qty,8);
  await call(deleteBill,'POST','/api/billSale/deleteBill',{billId,companyId:f.company_id});
  await movement({STOCK:1200,OTHER_CURRENT_ASSET:120,ACCOUNTS_PAYABLE:-1320},'delete sale restores stock value, quantity and sales accounts');
  assert.equal((await db.query('SELECT qty FROM items WHERE id=$1',[itemId])).rows[0].qty,10);
  await call(deleteProduct,'POST','/api/products/delete',{id:productId,companyId:f.company_id});
  await movement({},'delete last purchased product clears purchase stock/tax/payable');
  // Catalogue-only stock is not a financial purchase document.
  const standaloneId=randomUUID();fixtureIds.add(standaloneId);
  await call(batch,'POST','/api/products/save-batch',{companyId:f.company_id,products:[{name:'Catalogue-only fixture',id:standaloneId,categoryId:f.category_id,variants:[]}]});
  await movement({},'catalogue-only create does not invent an accounting purchase');
  await call(editProduct,'POST','/api/products/update',{companyId:f.company_id,productId:standaloneId,product:{name:'Renamed catalogue fixture'},variants:[]});
  await movement({},'catalogue-only edit has no financial movement');
  await call(deleteProduct,'POST','/api/products/delete',{id:standaloneId,companyId:f.company_id});
  await movement({},'catalogue-only delete has no financial movement');
  const paidId=randomUUID();fixtureIds.add(paidId);
  const paid=await call(batch,'POST','/api/products/save-batch',{companyId:f.company_id,products:[{...product,id:paidId,variants:[{pprice:100,sprice:150,items:[{qty:2}]}]}],po:{...purchase,paymentType:'BANK',subTotalAmount:200,totalAmount:220}});
  await movement({STOCK:200,OTHER_CURRENT_ASSET:20,BANK:-220},'batch create bank-paid purchase posts stock and settlement');
  // The PO list uses model deletion; exercise its actual cascading DB operation.
  await query('BEGIN');
  await query('DELETE FROM purchase_orders WHERE id=$1 AND company_id=$2',[paid.poId,f.company_id]);
  await query('COMMIT');
  await movement({},'delete purchase order cascades sources and reverses stock/tax/bank');
  assert.equal((await db.query('SELECT id FROM products WHERE id=$1',[paidId])).rowCount,0);

  const savePO=(await import('../server/api/purchaseorder/save.post')).default;
  const source = async (id:string) => (await db.query(`SELECT e.amount,s.journal_id,j.total,j.status
    FROM accountant_v2_distributor_events e JOIN accountant_v2_distributor_sources s
    ON s.company_id=e.company_id AND s.distributor_id=e.distributor_id AND s.source_key=e.source_key
    JOIN accountant_v2_manual_journals j ON j.id=s.journal_id WHERE e.company_id=$1 AND e.source_key=$2`,[f.company_id,`purchase:${id}`])).rows[0];
  const check = (label:string) => { cases.push(label);console.log('PASS '+label); };
  const removePO = async(id:string) => {await query('BEGIN');await query('DELETE FROM purchase_orders WHERE id=$1 AND company_id=$2',[id,f.company_id]);await query('COMMIT');};
  // Each public PO creation path, every selectable payment mode, and edits after settlement.
  for(const paymentType of ['CREDIT','CASH','BANK','UPI','CARD','CHEQUE']) {
    for(const path of ['batch','header']) {
      const id=randomUUID();fixtureIds.add(id);
      const header={...purchase,paymentType,tax:0,subTotalAmount:300,totalAmount:300};
      const saved=path==='batch'
        ?await call(batch,'POST','/api/products/save-batch',{companyId:f.company_id,products:[{...product,id,variants:[{pprice:100,sprice:150,items:[{qty:3}]}]}],po:header})
        :await call(savePO,'POST','/api/purchaseorder/save',{companyId:f.company_id,productIds:[],payment:header});
      fixtureIds.add(saved.poId);
      const payments=(await db.query('SELECT id,amount,payment_type,payment_no FROM distributor_payments WHERE purchase_order_id=$1',[saved.poId])).rows;
      assert.equal(payments.length,paymentType==='CREDIT'?0:1);
      if(payments.length){assert.equal(Number(payments[0].amount),300);assert.equal(payments[0].payment_type,paymentType);assert.ok(payments[0].payment_no!=null);}
      assert.equal((await db.query('SELECT id FROM distributor_credits WHERE purchase_order_id=$1',[saved.poId])).rowCount,0,'PO never creates a linked DC');
      const before=await source(saved.poId);assert.equal(Number(before.amount),300);assert.equal(Number(before.total),300);
      await call(editPO,'POST','/api/purchaseorder/update',{companyId:f.company_id,poId:saved.poId,payment:{...header,totalAmount:400,subTotalAmount:400}});
      const edited=await source(saved.poId);assert.equal(Number(edited.amount),400);assert.equal(Number(edited.total),400);assert.equal(edited.journal_id,before.journal_id,'PO edit keeps the existing accounting row');
      await call(editPO,'POST','/api/purchaseorder/update',{companyId:f.company_id,poId:saved.poId,payment:{...header,totalAmount:400,subTotalAmount:400}});
      assert.equal((await source(saved.poId)).journal_id,before.journal_id);
      assert.deepEqual((await db.query('SELECT id,amount,payment_type,payment_no FROM distributor_payments WHERE purchase_order_id=$1',[saved.poId])).rows,payments,'PO edits preserve recorded settlements');
      check(`${path} ${paymentType}: create, numbered payment/no DC, edit in place, repeat edit and preserve settlement`);
      await removePO(saved.poId);
      await movement({},`${path} ${paymentType}: delete restores all account balances`);
    }
  }

  const makeCreditPO=async(qty:number)=>{
    const id=randomUUID();fixtureIds.add(id);
    const result=await call(batch,'POST','/api/products/save-batch',{companyId:f.company_id,products:[{...product,id,variants:[{pprice:100,sprice:150,items:[{qty}]}]}],po:{...purchase,tax:0,totalAmount:qty*100,subTotalAmount:qty*100}});
    fixtureIds.add(result.poId);return result.poId;
  };
  const first=await makeCreditPO(10),second=await makeCreditPO(20);
  const due=async(id:string)=>Number((await db.query(`SELECT total_amount-COALESCE((SELECT sum(amount) FROM (
    SELECT amount FROM distributor_payments WHERE purchase_order_id=po.id UNION ALL SELECT amount FROM distributor_payment_allocations WHERE purchase_order_id=po.id) paid),0) due
    FROM purchase_orders po WHERE id=$1`,[id])).rows[0].due);
  const multiBody={companyId:f.company_id,distributorId:f.distributor_id,paymentType:'BANK',amount:1500,createdAt:date,createExpense:true,
    allocations:[{purchaseOrderId:first,amount:1000},{purchaseOrderId:second,amount:500}]};
  const multi=await call(createPay,'POST','/api/distributor/payments',multiBody);
  assert.equal(await due(first),0);assert.equal(await due(second),1500);
  await movement({STOCK:3000,ACCOUNTS_PAYABLE:-1500,BANK:-1500},'one bank payment allocated across two POs posts once');
  const allocations=[{purchaseOrderId:first,amount:900},{purchaseOrderId:second,amount:700}];
  await call(editPay,'PUT',`/api/distributor/payments/${multi.id}`,{...multiBody,amount:1600,allocations},multi.id);
  assert.equal(await due(first),100);assert.equal(await due(second),1300);
  assert.equal(Number((await db.query('SELECT e.total_amount FROM expenses e JOIN distributor_payments p ON p.expense_id=e.id WHERE p.id=$1',[multi.id])).rows[0].total_amount),1600);
  await movement({STOCK:3000,ACCOUNTS_PAYABLE:-1400,BANK:-1600},'edit shared payment updates both PO dues and its single linked expense');
  await assert.rejects(call(editPay,'PUT',`/api/distributor/payments/${multi.id}`,{...multiBody,amount:1600,allocations:undefined},multi.id),/preserve/);
  await assert.rejects(call(editPO,'POST','/api/purchaseorder/update',{companyId:f.company_id,poId:first,payment:{...purchase,tax:0,totalAmount:800,subTotalAmount:800}}),/allocated/);
  await assert.rejects(call(createPay,'POST','/api/distributor/payments',{...multiBody,amount:101,allocations:[{purchaseOrderId:first,amount:101}]}),/exceeds/);
  await assert.rejects(call(createPay,'POST','/api/distributor/payments',{...multiBody,allocations:[{purchaseOrderId:first,amount:750},{purchaseOrderId:first,amount:750}]}),/once/);
  await assert.rejects(call(createPay,'POST','/api/distributor/payments',{...multiBody,amount:1501}),/equal/);
  await assert.rejects(call(createPay,'POST','/api/distributor/payments',{...multiBody,amount:1,allocations:[{purchaseOrderId:randomUUID(),amount:1}]}),/belong/);
  assert.equal(await due(first),100);assert.equal(await due(second),1300);
  check('allocation protections: overpayment, duplicate/missing PO, sum mismatch, lost allocations and PO reduction roll back');
  await call(editPay,'PUT',`/api/distributor/payments/${multi.id}`,{...multiBody,amount:1600,allocations:[]},multi.id);
  assert.equal(await due(first),1000);assert.equal(await due(second),2000);
  assert.equal(Number((await db.query('SELECT amount FROM distributor_payments WHERE id=$1',[multi.id])).rows[0].amount),1600);
  await call(editPay,'PUT',`/api/distributor/payments/${multi.id}`,{...multiBody,amount:1600,allocations},multi.id);
  await call(deletePay,'DELETE',`/api/distributor/payments/${multi.id}`,{},multi.id);
  assert.equal(await due(first),1000);assert.equal(await due(second),2000);
  assert.equal((await db.query('SELECT id FROM distributor_payment_allocations WHERE payment_id=$1',[multi.id])).rowCount,0);
  check('unlink/relink/delete shared payment restores each PO due and removes allocations');
  await removePO(first);await removePO(second);await movement({},'shared-payment lifecycle leaves no accounting movement');

  // Standalone product credits remain independent of PO purchases.
  const standaloneCredit=await call(createCredit,'POST','/api/distributor/credits',{...creditBody,creditKind:'PRODUCT',amount:50});
  const dc=(await db.query('SELECT purchase_order_id,money_transaction_id,credit_no FROM distributor_credits WHERE id=$1',[standaloneCredit.id])).rows[0];
  assert.equal(dc.purchase_order_id,null);assert.equal(dc.money_transaction_id,null);assert.ok(dc.credit_no!=null);
  await call(editCredit,'PUT',`/api/distributor/credits/${standaloneCredit.id}`,{...creditBody,creditKind:'PRODUCT',amount:75},standaloneCredit.id);
  assert.equal(Number((await db.query('SELECT amount FROM accountant_v2_distributor_events WHERE company_id=$1 AND source_key=$2',[f.company_id,`credit:${standaloneCredit.id}`])).rows[0].amount),75);
  await assert.rejects(call(createCredit,'POST','/api/distributor/credits',{...creditBody,purchaseOrderId:poId}),/standalone/);
  await call(deleteCredit,'DELETE',`/api/distributor/credits/${standaloneCredit.id}`,{},standaloneCredit.id);
  check('standalone numbered product credit create/edit/delete works; PO-linked credit is rejected');
  await movement({},'all purchase/payment/credit scenarios restore baseline account balances');
  assert.equal((await db.query(`SELECT j.id FROM accountant_v2_manual_journals j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id WHERE j.company_id=$1 AND NOT(j.id=ANY($2::text[])) GROUP BY j.id HAVING sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)<>0`,[f.company_id,journalBaseline])).rowCount,0,'Every journal including reversals balances');
  await assertLegacyUnchanged?.();
  }
  // An originally paid PO can acquire a due after an edit; settle it alongside a credit PO.
  const paidProductId=randomUUID(),paidVariantId=randomUUID(),paidItemId=randomUUID();
  [paidProductId,paidVariantId,paidItemId].forEach(id=>fixtureIds.add(id));
  const paidProduct={...product,id:paidProductId,variants:[{...product.variants[0],id:paidVariantId,items:[{id:paidItemId,size:'M',qty:3}]}]};
  const paidPO=await call(batch,'POST','/api/products/save-batch',{companyId:f.company_id,products:[paidProduct],po:{...purchase,paymentType:'BANK',tax:0,totalAmount:300,subTotalAmount:300}});
  fixtureIds.add(paidPO.poId);
  const originalSettlement=(await db.query('SELECT id,amount FROM distributor_payments WHERE purchase_order_id=$1',[paidPO.poId])).rows;
  await call(editProduct,'POST','/api/products/update',{companyId:f.company_id,productId:paidProductId,product:{name:product.name,categoryId:f.category_id},variants:[{...paidProduct.variants[0],items:[{id:paidItemId,size:'M',qty:4}]}],syncPurchaseOrder:true,updateInitialQty:true});
  const secondProductId=randomUUID();fixtureIds.add(secondProductId);
  const creditPO=await call(batch,'POST','/api/products/save-batch',{companyId:f.company_id,products:[{...product,id:secondProductId,variants:[{pprice:100,sprice:150,items:[{qty:2}]}]}],po:{...purchase,tax:0,totalAmount:200,subTotalAmount:200}});
  fixtureIds.add(creditPO.poId);
  const readDue=async(id:string)=>Number((await db.query(`SELECT total_amount-COALESCE((SELECT sum(amount) FROM (
    SELECT amount FROM distributor_payments WHERE purchase_order_id=po.id UNION ALL SELECT amount FROM distributor_payment_allocations WHERE purchase_order_id=po.id) paid),0) due
    FROM purchase_orders po WHERE id=$1`,[id])).rows[0].due);
  assert.equal(await readDue(paidPO.poId),100);
  const remainder=await call(createPay,'POST','/api/distributor/payments',{companyId:f.company_id,distributorId:f.distributor_id,paymentType:'BANK',amount:150,createdAt:date,allocations:[{purchaseOrderId:paidPO.poId,amount:100},{purchaseOrderId:creditPO.poId,amount:50}]});
  assert.equal(await readDue(paidPO.poId),0);assert.equal(await readDue(creditPO.poId),150);
  assert.deepEqual((await db.query('SELECT id,amount FROM distributor_payments WHERE purchase_order_id=$1',[paidPO.poId])).rows,originalSettlement);
  await movement({STOCK:600,ACCOUNTS_PAYABLE:-150,BANK:-450},'settle edited paid PO remainder and credit PO together, preserving original payment');
  await call(deletePay,'DELETE',`/api/distributor/payments/${remainder.id}`,{},remainder.id);
  assert.equal(await readDue(paidPO.poId),100);assert.equal(await readDue(creditPO.poId),200);
  await movement({STOCK:600,ACCOUNTS_PAYABLE:-300,BANK:-300},'delete remainder payment restores both dues without altering original settlement');
  for(const id of [paidPO.poId,creditPO.poId]) {await query('BEGIN');await query('DELETE FROM purchase_orders WHERE id=$1 AND company_id=$2',[id,f.company_id]);await query('COMMIT');}
  await movement({},'paid PO remainder lifecycle restores all account balances');
  await assertLegacyUnchanged?.();
  passed=true;
} finally {
  restores.forEach(restore=>restore());
  (pool as any).connect=originalConnect;(pool as any).query=originalQuery;
  await db.query('ROLLBACK');db.release();await pool.end();await prisma.$disconnect();
  const reportDir='../artifacts/purchase-flow-regression';mkdirSync(reportDir,{recursive:true});
  writeFileSync(`${reportDir}/${process.argv.includes('--remaining-due-only')?'remaining-due':'latest'}.json`,JSON.stringify({at:new Date().toISOString(),passed,rolledBack:true,schemaChanges:false,cases},null,2));
  console.log('Rolled back all product/distributor test records, counters, stocks and journals.');
}
