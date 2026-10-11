import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc';
const samples=new Map();
function load(file,bindings,tail='') {
 const result=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 assert.equal(result.diagnostics?.length||0,0,file);
 const code=result.outputText.replace(/^import .*;?\r?\n/gm,'').replace(/export default /,'return ').replace(/export /g,'');
 return new Function(...Object.keys(bindings),code+tail)(...Object.values(bindings));
}
const helpers=load('server/utils/purchase-order-source.ts',{randomUUID},'\nreturn {ensurePurchaseOrderSource,createPurchaseOrderPayment};');
let state,calls=[];
const fixture=()=>({po:{id:'po',company_id:'company',payment_type:'CREDIT',total_amount:100,distributor_id:'vendor',created_at:new Date('2026-02-01')},audit:[],payments:[],counter:7});
const result=rows=>({rows,rowCount:rows.length});
const db={release(){},async query(raw,args=[]){
 const sql=raw.replace(/\s+/g,' ').trim();calls.push({sql,args});samples.set(sql,args);
 if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return result([]);
 if(sql.startsWith('SELECT pg_advisory'))return result([]);
 if(sql.startsWith('SELECT * FROM purchase_orders'))return result(args.includes('company')?[state.po]:[]);
 if(sql.startsWith('SELECT 1 FROM accountant_v2_accountant_audit'))return result(state.audit.length?[{}]:[]);
 if(sql.startsWith('SELECT "after" FROM accountant_v2_accountant_audit'))return result([{after:{payable:'ap',stock:'stock',tax:'tax'}}]);
 if(sql.startsWith('INSERT INTO accountant_v2_accountant_audit')){state.audit.push(JSON.parse(args[3]));return result([]);}
 if(sql.startsWith('SELECT id FROM distributor_payments')||sql.startsWith('SELECT id,expense_id FROM distributor_payments'))return result(state.payments);
 if(sql.startsWith('SELECT payment_id,amount'))return result([]);
 if(sql.startsWith('UPDATE companies SET purchase_counter'))return result([{purchase_counter:11}]);
 if(sql.startsWith('UPDATE companies SET distributor_payment_counter'))return result([{number:state.counter++}]);
 if(sql.startsWith('INSERT INTO purchase_orders')){state.po={...state.po,id:args[0],created_at:args[1],company_id:args[2],payment_type:args[3],total_amount:args[4],distributor_id:args[5]};return result([]);}
 if(sql.startsWith('INSERT INTO distributor_payments')){state.payments.push({id:args[0],amount:args[2],payment_no:args[7]});return result([]);}
 if(sql.startsWith('UPDATE purchase_orders SET payment_type')){state.po={...state.po,payment_type:args[1],created_at:args[4],total_amount:args[5],distributor_id:args[3]||state.po.distributor_id};return result([]);}
 throw Error('Unexpected query '+sql);
}};
state=fixture();await helpers.ensurePurchaseOrderSource(db,'company','po');assert.equal(state.audit.length,1);assert.deepEqual(state.audit[0].accounts,{payable:'ap',stock:'stock',tax:'tax'});
await helpers.ensurePurchaseOrderSource(db,'company','po');assert.equal(state.audit.length,1,'Repeated edits do not add header registrations');
assert.equal(await helpers.createPurchaseOrderPayment(db,'company','po'),null);assert.equal(state.counter,7,'Credit PO does not reserve a DP or create a DC');
state.po.payment_type='BANK';await helpers.createPurchaseOrderPayment(db,'company','po');assert.equal(state.payments[0].payment_no,7);assert.equal(state.payments[0].amount,100);
state.po.total_amount=150;await helpers.createPurchaseOrderPayment(db,'company','po');assert.equal(state.payments.length,1);assert.equal(state.payments[0].amount,100,'Existing payment stays at the recorded amount');
await assert.rejects(helpers.ensurePurchaseOrderSource(db,'foreign-company','po'),/not found/);
const bindings={...helpers,crypto:{randomUUID},defineEventHandler:x=>x,readBody:async e=>e.body,
 createError:options=>Object.assign(new Error(options.statusMessage),options),pool:{connect:async()=>db},
 useCompanyRequestSession:async()=>({data:{companyId:'company'}}),lockCompanyRequest:async()=>{},
 selectDistributorAccounts:async()=>{},updatePurchaseAccounting:async()=>true};
for(const paymentType of ['CREDIT','BANK']){
 state=fixture();calls=[];const save=load('server/api/purchaseorder/save.post.ts',bindings);
 await save({body:{payment:{paymentType,distributorId:'vendor',totalAmount:100,createdAt:'2026-02-01'}}});
 assert.equal(state.payments.length,paymentType==='CREDIT'?0:1);assert.equal(state.audit.length,1);
 assert.ok(!calls.some(c=>c.sql.includes('distributor_credits')),'Saving either type never writes PO-linked DC');
}
state=fixture();state.payments=[{id:'dp',amount:40}];calls=[];
const edit=load('server/api/purchaseorder/update.post.ts',bindings);
await edit({body:{poId:'po',payment:{paymentType:'CREDIT',distributorId:'vendor',totalAmount:150,createdAt:'2026-02-01'}}});
assert.equal(state.po.total_amount,150);assert.deepEqual(state.payments,[{id:'dp',amount:40}]);
assert.ok(!calls.some(c=>/^(INSERT|UPDATE|DELETE).*distributor_credits/.test(c.sql)));
assert.ok(!calls.some(c=>/^(UPDATE|DELETE).*distributor_payments/.test(c.sql)));
state=fixture();state.po.payment_type='BANK';state.payments=[{id:'dp1',amount:40,expense_id:'expense'},{id:'dp2',amount:20}];
await edit({body:{poId:'po',payment:{paymentType:'BANK',distributorId:'vendor',totalAmount:150,createdAt:'2026-02-01'}}});
assert.deepEqual(state.payments,[{id:'dp1',amount:40,expense_id:'expense'},{id:'dp2',amount:20}],'Paid POs with multiple real settlements can be edited without resetting payments');
const totals=load('server/utils/purchase-order-totals.ts',{...helpers,updatePurchaseAccounting:async()=>true},'\nreturn recalculatePurchaseOrderTotals;');
const recalculation=[];await totals({query:async(sql,args)=>{recalculation.push(sql);if(sql.includes('SELECT id, payment_type'))return result([{payment_type:'BANK',tax:0,discount:0,adjustment:0}]);if(sql.includes('AS subtotal'))return result([{subtotal:200}]);if(sql.startsWith('UPDATE purchase_orders'))return result([]);return db.query(sql,args);}},{companyId:'company',poId:'po'});
assert.ok(!recalculation.some(sql=>sql.includes('distributor_payments')||sql.includes('distributor_credits')),'Product quantity/cost edits never overwrite actual payments or credits');
const purchases=load('utils/distributor-purchase-transactions.ts',{},'\nreturn distributorPurchaseTransactions;');
assert.deepEqual(purchases([{id:'po',purchaseOrderNo:10,totalAmount:150,createdAt:'2026-02-01'},{id:'empty',totalAmount:0}]).map(p=>[p.no,p.type,p.credit]),[['PO-10','PURCHASE',150]]);
for(const file of ['pages/distributor/index.vue','components/Distributor/List.vue','components/Distributor/Dlist.vue']){
 const {descriptor,errors}=parse(readFileSync(file,'utf8'),{filename:file});assert.deepEqual(errors,[]);compileScript(descriptor,{id:file});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:file,id:file}).errors,[]);
}
for(const file of ['server/api/products/save-batch.post.ts','server/api/purchaseorder/save.post.ts','server/api/purchaseorder/update.post.ts'])assert.doesNotMatch(readFileSync(file,'utf8'),/INSERT INTO distributor_credits|UPDATE distributor_credits|DELETE FROM distributor_credits/);
if(process.argv.includes('--check-sql')){
 await import('dotenv/config');const {default:pg}=await import('pg');const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();
 try{await c.query('BEGIN READ ONLY');for(const [sql,args]of samples)if(!['BEGIN','COMMIT','ROLLBACK'].includes(sql))await c.query('EXPLAIN '+sql,args);
 const queries=load('server/utils/distributor-source-queries.ts',{},'\nreturn {distributorPurchasesAndCreditsSql,distributorSourceOpeningSql};');
 await c.query('EXPLAIN '+queries.distributorPurchasesAndCreditsSql,['company','vendor','2026-01-01','2026-12-31']);
 await c.query('EXPLAIN '+queries.distributorSourceOpeningSql,['company','vendor','2026-01-01']);
 for(const file of ['server/api/report/gstr2b.get.ts','server/api/report/gstr3b.get.ts'])for(const match of readFileSync(file,'utf8').matchAll(/`([^`]*SELECT[^`]*)`/g))await c.query('EXPLAIN '+match[1],['company','2026-01-01','2026-12-31']);
 await c.query('ROLLBACK');console.log('All changed source/export/GST SQL planned read-only.');}finally{await c.end();}
}
console.log('PO source flow passed: actual credit/paid create APIs, numbered payments, edit preservation, recalculation, source ownership, idempotence and Vue templates.');
