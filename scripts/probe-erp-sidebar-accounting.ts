import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Readable} from 'node:stream';
import {createEvent,createError,defineEventHandler,getHeader,getQuery,getRequestURL,readBody} from 'h3';
import {pool} from '../server/db';

// Read/rollback probes for routes absent from the existing happy-path suites.
// Deliberately report observed defects; a completed probe is not a product pass.
const dir=process.env.ACCOUNTING_REVIEW_DIR||'scripts/production-accounting/runs/workflow-review-2026-10-06';
const db=await pool.connect(),originalConnect=pool.connect.bind(pool),originalQuery=pool.query.bind(pool);
let depth=0;
const query=async(q:any,args?:any[])=>{
 const command=typeof q==='string'?q.trim().toUpperCase():'';
 if(command==='BEGIN')return db.query(`SAVEPOINT handler_${++depth}`);
 if(command==='COMMIT'){await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');return db.query(`RELEASE SAVEPOINT handler_${depth--}`);}
 if(command==='ROLLBACK'){const name=`handler_${depth--}`;await db.query(`ROLLBACK TO SAVEPOINT ${name}`);return db.query(`RELEASE SAVEPOINT ${name}`);}
 return db.query(q,args);
};
const findings:any[]=[];
try{
 await db.query('BEGIN');await db.query('SET LOCAL search_path TO public');
 const company='5271d5cb-2e97-4303-85c0-3fc9e3e6bb05';
 const f=(await db.query(`SELECT c.*,(SELECT user_id FROM company_users WHERE company_id=c.id AND NOT deleted LIMIT 1) user_id,
  (SELECT id FROM expense_categories WHERE company_id=c.id LIMIT 1) expense_category_id
  FROM companies c WHERE id=$1`,[company])).rows[0];assert.ok(f);
 const session={data:{companyId:company,id:f.user_id,role:'manager'}};
 Object.assign(globalThis,{createError,defineEventHandler,getHeader,getQuery,getRequestURL,readBody,requireAuthSession:async()=>session,useAuthSession:async()=>session});
 (pool as any).connect=async()=>({query,release(){}});(pool as any).query=query;
 const call=async(handler:any,method:string,path:string,body:any,id?:string)=>{
  const json=JSON.stringify(body),req=Readable.from([Buffer.from(json)]) as any;
  req.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(json))};req.method=method;req.url=path;
  const event=createEvent(req,{} as any);event.context.params=id?{id}:{};
  const result=await handler(event);await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');return result;
 };
 async function probe(name:string,fn:()=>Promise<any>){const only=process.argv.find(v=>v.startsWith('--only='))?.slice(7);if(only&&!name.toLowerCase().includes(only))return;await db.query('SAVEPOINT probe');try{const detail=await fn();findings.push({name,...detail});console.log(JSON.stringify(findings.at(-1)));}finally{await db.query('ROLLBACK TO SAVEPOINT probe');await db.query('RELEASE SAVEPOINT probe');}}
 const newTotals=async()=> (await db.query(`SELECT a.account_type,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)::text amount
  FROM accountant_v2_manual_journals j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id
  JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id
  WHERE j.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL
  GROUP BY a.account_type ORDER BY a.account_type`,[company])).rows;
 await probe('Sales change payment method',async()=>{
  const b=(await db.query("SELECT b.id,b.grand_total FROM bills b JOIN accountant_v2_erp_sources s ON s.company_id=b.company_id AND s.source_key='bill:'||b.id AND s.journal_id IS NOT NULL WHERE b.company_id=$1 AND NOT b.deleted AND NOT COALESCE(b.is_markit,false) AND COALESCE(b.type,'BILL')='BILL' AND b.payment_method='Cash' AND b.payment_status='PAID' AND b.grand_total>0 ORDER BY b.id LIMIT 1",[company])).rows[0];assert.ok(b);
  const ledgerBefore=(await db.query('SELECT account_type,direction,amount FROM account_ledger_entries WHERE company_id=$1 AND source_id=$2 ORDER BY id',[company,b.id])).rows;
  await call((await import('../server/api/billSale/updatePaymentMethod.post')).default,'POST','/api/billSale/updatePaymentMethod',{billId:b.id,companyId:company,paymentMethod:'UPI'});
  const ledgerAfter=(await db.query('SELECT account_type,direction,amount FROM account_ledger_entries WHERE company_id=$1 AND source_id=$2 ORDER BY id',[company,b.id])).rows;
  const newLines=(await db.query(`SELECT a.account_type,l.side,l.amount FROM accountant_v2_erp_sources s JOIN accountant_v2_manual_journal_lines l ON l.journal_id=s.journal_id JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id WHERE s.company_id=$1 AND s.source_key=$2 ORDER BY a.account_type`,[company,'bill:'+b.id])).rows;
  assert.deepEqual(ledgerAfter,ledgerBefore,'Archived ledger remains unchanged');
  assert.ok(newLines.some((l:any)=>l.account_type==='BANK'&&l.side==='DEBIT'),'Updated source posts to Bank');
  assert.ok(!newLines.some((l:any)=>l.account_type==='CASH'),'Updated source no longer posts to Cash');
  return {defect:false,archiveUnchanged:true,billId:b.id,amount:b.grand_total,newLines};
 });
 await probe('Store cash/bank opening edit',async()=>{
  const before=await newTotals();await assert.rejects(call((await import('../server/api/accounts/opening-balances.put')).default,'PUT','/api/accounts/opening-balances',{cash:Number(f.cash||0)+100,bank:Number(f.bank||0),openingCashDate:'2026-10-06',openingBankDate:f.opening_bank_date}),{statusCode:410});
  assert.deepEqual(await newTotals(),before);return {defect:false,resolvedBy:'Retired route returns 410 without posting.'};
 });
 await probe('Legacy investment create',async()=>{
  const before=await newTotals();await assert.rejects(call((await import('../server/api/accounts/investments.post')).default,'POST','/api/accounts/investments',{userId:f.user_id,direction:'IN',amount:100,paymentMode:'BANK',status:'COMPLETED',date:'2026-10-06',note:'Rollback workflow verification'}),{statusCode:410});
  assert.deepEqual(await newTotals(),before);return {defect:false,resolvedBy:'Retired route returns 410 without posting.'};
 });
 await probe('New secondary bank opening',async()=>{
  const before=await newTotals();await assert.rejects(call((await import('../server/api/accounts/banks.post')).default,'POST','/api/accounts/banks',{bankName:'Rollback workflow verification',openingBalance:100,openingBalanceDate:'2026-10-06'}),{statusCode:410});
  assert.deepEqual(await newTotals(),before);return {defect:false,resolvedBy:'Retired route returns 410 without posting.'};
 });
 await probe('Client delete bill bypasses deletion service',async()=>{
  const b=(await db.query(`SELECT b.id FROM bills b JOIN entries e ON e.bill_id=b.id JOIN items i ON i.id=e.item_id
   JOIN accountant_v2_erp_sources s ON s.company_id=b.company_id AND s.source_key='bill:'||b.id AND s.journal_id IS NOT NULL
   WHERE b.company_id=$1 AND b.client_id IS NOT NULL AND NOT b.deleted AND NOT COALESCE(b.is_markit,false)
   AND COALESCE(b.type,'BILL')='BILL' AND e.qty>0 AND NOT e.return ORDER BY b.id LIMIT 1`,[company])).rows[0];assert.ok(b,'Find a client sale with physical stock');
  const stock=async()=> (await db.query('SELECT i.id,i.qty,i.sold_qty FROM items i JOIN entries e ON e.item_id=i.id WHERE e.bill_id=$1 ORDER BY i.id',[b.id])).rows;
  const oldLedger=async()=> (await db.query('SELECT id,account_type,direction,amount FROM account_ledger_entries WHERE company_id=$1 AND source_id=$2 ORDER BY id',[company,b.id])).rows;
  const beforeStock=await stock(),beforeLedger=await oldLedger();
  assert.ok(fs.readFileSync('pages/client/index.vue','utf8').includes("$fetch('/api/billSale/deleteBill'"),'Client page must use the full deletion service');
  await call((await import('../server/api/billSale/deleteBill.post')).default,'POST','/api/billSale/deleteBill',{billId:b.id,companyId:company});
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
  const afterStock=await stock(),afterLedger=await oldLedger();
  assert.deepEqual(afterLedger,beforeLedger,'Client deletion preserves the archived ledger');
  const state=(await db.query('SELECT journal_id FROM accountant_v2_erp_sources WHERE company_id=$1 AND source_key=$2',[company,'bill:'+b.id])).rows[0];
  assert.equal(state.journal_id,null,'Bill journal is reversed');
  assert.notDeepEqual(afterStock,beforeStock,'Sold stock is restored');
  return {defect:false,newPostingReversed:state.journal_id===null,
   stockRestored:JSON.stringify(beforeStock)!==JSON.stringify(afterStock),archiveUnchanged:true,
   explanation:'Client page bill deletion uses the full service to restore stock/points and reverse native postings. Client membership removal only sets inactive status and retains all document links.'};
 });
 await probe('Offline stock adjustment repeated request',async()=>{
  const item=(await db.query(`SELECT i.id,i.qty,i.sold_qty FROM items i JOIN variants v ON v.id=i.variant_id WHERE i.company_id=$1 AND i.qty>=2 AND v.p_price>0 ORDER BY i.id LIMIT 1`,[company])).rows[0];
  assert.ok(item,'Physical stock required for offline adjustment probe');
  const handler=(await import('../server/api/bill/offline.post')).default;
  const before=await newTotals(),payload={requestId:'offline-probe-retry',companyId:company,items:[{id:item.id,qty:1}],returnedItems:[]};
  await call(handler,'POST','/api/bill/offline',payload);
  const first=(await db.query('SELECT qty,sold_qty FROM items WHERE id=$1',[item.id])).rows[0];
  const firstTotals=await newTotals();
  await call(handler,'POST','/api/bill/offline',payload);
  const second=(await db.query('SELECT qty,sold_qty FROM items WHERE id=$1',[item.id])).rows[0];
  assert.equal(Number(first.qty),Number(item.qty)-1);assert.equal(Number(second.qty),Number(item.qty)-1);
  const secondTotals=await newTotals(),newBooksChanged=JSON.stringify(before)!==JSON.stringify(secondTotals);
  assert.ok(newBooksChanged);assert.deepEqual(firstTotals,secondTotals,'Retry does not repeat the accounting movement');
  return {defect:false,firstQuantity:first.qty,retriedQuantity:second.qty,newBooksChanged,explanation:'The persisted request receipt prevents repeated stock and accounting movements.'};
 });
 const existing=fs.existsSync(`${dir}/sidebar-route-probes.json`)?JSON.parse(fs.readFileSync(`${dir}/sidebar-route-probes.json`,'utf8')).findings:[];
 fs.writeFileSync(`${dir}/sidebar-route-probes.json`,JSON.stringify({at:new Date().toISOString(),method:'Actual handlers and installed triggers; outer transaction is always rolled back; authentication injected.',findings:[...existing.filter((p:any)=>!findings.some(f=>f.name===p.name)),...findings]},null,2));
}finally{(pool as any).connect=originalConnect;(pool as any).query=originalQuery;await db.query('ROLLBACK');db.release();await pool.end();console.log('All sidebar probe changes rolled back.');}
