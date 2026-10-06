import 'dotenv/config'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { pool as serverPool } from '../server/db'
import { executeStatementRow, assignStatementOperation } from '../server/utils/statement-execution'
import { executeOperation } from '../server/api/statement/_helpers'
import { createEvent, createError, readBody } from 'h3'
import { Readable } from 'node:stream'

const schema='statement_test_'+randomUUID().replaceAll('-','')
const admin=new Pool({connectionString:process.env.DATABASE_URL})
const testPool=new Pool({connectionString:process.env.DATABASE_URL})
const db={
 connect:()=>testPool.connect(), end:()=>testPool.end(),
 query:async(sql:string,args:any[]=[])=>{
  const client=await testPool.connect()
  try { await client.query('BEGIN');await client.query(`SET LOCAL search_path TO "${schema}"`);const result=await client.query(sql,args);await client.query('COMMIT');return result }
  catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 }
}
const originalConnect=serverPool.connect.bind(serverPool),originalQuery=serverPool.query.bind(serverPool)
const findings:any[]=[]
let failMark=false
try {
 await admin.query(`CREATE SCHEMA "${schema}"`)
 // Reuse the supplier fixture's source table definitions, never its test mutations.
 const supplier=fs.readFileSync('tests/account-settings-supplier.integration.test.ts','utf8')
 const sourceDdl=supplier.slice(supplier.indexOf('CREATE TABLE companies'),supplier.indexOf('`);\n for(const n'))
 await db.query(sourceDdl)
 await db.query(`CREATE TABLE bills(id text PRIMARY KEY,company_id text,created_at timestamp DEFAULT now(),invoice_number int,grand_total numeric,payment_method text,payment_status text,split_payments jsonb,deleted boolean DEFAULT false,is_markit boolean DEFAULT false,type text,notes text);
 CREATE TABLE variants(id text PRIMARY KEY,p_price numeric);
 CREATE TABLE entries(id text PRIMARY KEY,bill_id text,variant_id text,qty numeric,value numeric,tax numeric,return boolean DEFAULT false);
 CREATE TABLE expense_categories(id text PRIMARY KEY,name text,company_id text,status boolean DEFAULT true,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
 CREATE TABLE company_users(company_id text,user_id text,deleted boolean DEFAULT false);
 CREATE TABLE expenses(id text PRIMARY KEY,company_id text,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now(),expense_date timestamp,expense_number int,from_id text,total_amount numeric,tax_amount numeric,payment_mode text,status text,note text,currency text,expense_category_id text);
 ALTER TABLE distributor_payments ADD COLUMN expense_id text, ADD COLUMN bill_no text;
 CREATE TABLE statement_batches(id text PRIMARY KEY,company_id text,status text DEFAULT 'PENDING',chat_id text);
 CREATE TABLE statement_rows(id text PRIMARY KEY,batch_id text REFERENCES statement_batches(id),s_no int,date text,description text,debit numeric,credit numeric,operation text,operation_meta jsonb,executed boolean DEFAULT false,execution_result jsonb);`)
 await db.query(`CREATE TABLE statement_mappings(id text PRIMARY KEY,company_id text,remarks text,operation text,operation_meta jsonb,operation_label text,user_input text,created_at timestamp DEFAULT now());
 ALTER TABLE statement_rows ADD COLUMN operation_label text, ADD COLUMN user_input text;`)
 for (const migration of ['20260926120000_accountant_v2','20260927120000_distributor_accounting','20260927123000_distributor_history_projection','20260927130000_distributor_purchase_tax','20260927133000_distributor_receipt_consistency','20260927150000_erp_accounting','20260927151000_erp_deleted_source_stability']) {
  await db.query(fs.readFileSync('prisma/migrations/'+migration+'/migration.sql','utf8'))
 }
 await db.query(`INSERT INTO companies(id) VALUES('b');
 INSERT INTO expense_categories(id,name,company_id) VALUES('category','Rent','a'),('foreign-category','Other','b');
 INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,account_type,category,updated_at) VALUES
 ('bank-default','a','Default bank','BANK','ASSET',now()),('bank-selected','a','Selected bank','BANK','ASSET',now()),('foreign-bank','b','Foreign bank','BANK','ASSET',now()),
 ('expense','a','Expense','EXPENSE','EXPENSE',now()),('payable','a','Supplier payable','ACCOUNTS_PAYABLE','LIABILITY',now());
 INSERT INTO accountant_v2_erp_settings(company_id,accounts,enabled,activated_at) VALUES('a','{"expense":"expense","bank":"bank-default"}',true,'2000-01-01');
 INSERT INTO accountant_v2_accountant_contact(id,company_id,name,type,updated_at) VALUES('vendor-contact','a','Vendor','VENDOR',now());
 INSERT INTO accountant_v2_distributor_settings(company_id,distributor_id,contact_id,enabled) VALUES('a','vendor','vendor-contact',true);
 INSERT INTO accountant_v2_distributor_mappings(company_id,distributor_id,role,account_id) VALUES('a','vendor','payable','payable'),('a','vendor','bank','bank-default');
 INSERT INTO statement_batches(id,company_id,status) VALUES('batch','a','PENDING');
 INSERT INTO statement_rows(id,batch_id,s_no,date,description,debit,credit,operation,operation_meta) VALUES
 ('expense-row','batch',1,'06/10/2026','Rent',100,0,'EXPENSE','{"categoryId":"category"}'),
 ('supplier-row','batch',2,'06/10/2026','Supplier',0,125,'DISTRIBUTOR_PAYMENT','{"distributorId":"vendor"}'),
 ('bad-row','batch',3,'06/10/2026','Invalid',50,0,'INVALID','{}');`)
 ;(serverPool as any).query=db.query.bind(db)
 ;(serverPool as any).connect=async()=>{
  const client=await db.connect(),query=client.query.bind(client)
  return {release:()=>client.release(),query:async(sql:string,args:any[])=>{
   if(sql==='BEGIN') { const result=await query(sql);await query(`SET LOCAL search_path TO "${schema}"`);return result }
   if(failMark && sql.startsWith('UPDATE statement_rows SET executed=true')) { failMark=false;throw Error('Injected marking failure') }
   return query(sql,args)
  }}
 }
 const count=async(table:string)=>Number((await db.query(`SELECT count(*) FROM ${table}`)).rows[0].count)
 failMark=true
 await assert.rejects(executeStatementRow('a','test','expense-row','bank-selected'),/marking failure/)
 assert.equal(await count('expenses'),0)
 assert.equal(await count('accountant_v2_erp_sources'),0)
 assert.equal(await count('accountant_v2_manual_journals'),0)
 assert.match((await db.query("SELECT execution_result FROM statement_rows WHERE id='expense-row'")).rows[0].execution_result.error,/marking failure/)
 const first=await executeStatementRow('a','test','expense-row','bank-selected',{requestId:'initial-one'})
 const replay=await executeStatementRow('a','test','expense-row','bank-selected')
 assert.equal(replay.operationId,first.operationId);assert.equal(await count('expenses'),1)
 const reloadReplay=await executeStatementRow('a','test','expense-row','bank-selected',{reexecute:true,requestId:'initial-one'})
 assert.equal(reloadReplay.operationId,first.operationId,'Reload after a lost initial response replays even when the UI now sees an executed row')
 assert.equal(await count('expenses'),1)
 const bankLines=async(key:string,source='accountant_v2_erp_sources')=>(await db.query(`SELECT l.account_id,l.side,l.amount::text FROM ${source} s JOIN accountant_v2_manual_journal_lines l ON l.journal_id=s.journal_id WHERE s.source_key=$1 ORDER BY l.account_id`,[key])).rows
 const expenseLines=await bankLines('expense:'+first.operationId)
 assert.ok(expenseLines.some(l=>l.account_id==='bank-selected' && l.side==='CREDIT' && Number(l.amount)===100))
 assert.ok(!expenseLines.some(l=>l.account_id==='bank-default'))
 const supplierReceipt=await executeStatementRow('a','test','supplier-row','bank-selected')
 const supplierLines=await bankLines('payment:'+supplierReceipt.operationId,'accountant_v2_distributor_sources')
 assert.ok(supplierLines.some(l=>l.account_id==='bank-selected' && Number(l.amount)===125))
 assert.equal((await db.query('SELECT status FROM statement_batches')).rows[0].status,'PENDING')
 await assert.rejects(executeStatementRow('b','test','expense-row','foreign-bank'),/not found/i)
 await db.query(`INSERT INTO statement_rows(id,batch_id,s_no,date,description,debit,credit,operation,operation_meta) VALUES('scope-row','batch',4,'06/10/2026','Scope',50,0,'EXPENSE','{"categoryId":"category"}')`)
 await assert.rejects(executeStatementRow('a','test','scope-row','foreign-bank'),/active accounting bank/)
 await db.query(`UPDATE statement_rows SET operation_meta='{"categoryId":"foreign-category"}' WHERE id='scope-row'`)
 await assert.rejects(executeStatementRow('a','test','scope-row','bank-selected'),/category does not belong/)
 await db.query(`UPDATE statement_rows SET operation_meta='{"categoryId":"category"}' WHERE id='scope-row'`)
 const concurrent=await Promise.all([executeStatementRow('a','test','scope-row','bank-selected'),executeStatementRow('a','test','scope-row','bank-selected')])
 assert.equal(concurrent[0].operationId,concurrent[1].operationId);assert.equal(await count('expenses'),2)
 failMark=true
 await assert.rejects(executeStatementRow('a','test','expense-row','bank-selected',{reexecute:true,requestId:'replace-one'}),/marking failure/)
 assert.equal((await db.query('SELECT id FROM expenses WHERE id=$1',[first.operationId])).rowCount,1,'Failed replacement restores the original source')
 assert.equal((await db.query("SELECT execution_result FROM statement_rows WHERE id='expense-row'")).rows[0].execution_result.operationId,first.operationId)
 const replacement=await executeStatementRow('a','test','expense-row','bank-selected',{reexecute:true,requestId:'replace-one'})
 const replacementReplay=await executeStatementRow('a','test','expense-row','bank-selected',{reexecute:true,requestId:'replace-one'})
 assert.equal(replacement.operationId,replacementReplay.operationId);assert.equal(await count('expenses'),2)
 await assert.rejects(executeStatementRow('a','test','expense-row','bank-default',{reexecute:true,requestId:'replace-one'}),/different details/)
 Object.assign(globalThis,{useAuthSession:async()=>({data:{companyId:'a',id:'test'}}),createError,readBody})
 const banksHandler=(await import('../server/api/statement/banks.get')).default
 const bankRequest=Readable.from([]) as any;bankRequest.method='GET';bankRequest.url='/api/statement/banks';bankRequest.headers={}
 const availableBanks=await banksHandler(createEvent(bankRequest,{} as any))
 assert.deepEqual(availableBanks.map(bank=>bank.id).sort(),['bank-default','bank-selected'])
 const batchHandler=(await import('../server/api/statement/execute.post')).default
 const batchCall=()=>{const body=JSON.stringify({batchId:'batch',bankAccountId:'bank-selected'}),req=Readable.from([Buffer.from(body)]) as any;req.method='POST';req.url='/api/statement/execute';req.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(body))};return batchHandler(createEvent(req,{} as any))}
 const failed=await batchCall();assert.equal(failed.errors,1)
 assert.equal((await db.query('SELECT status FROM statement_batches')).rows[0].status,'PENDING')
 await assignStatementOperation('a','bad-row',{operation:'IGNORE'},'ignore')
 const retried=await batchCall();assert.equal(retried.errors,0)
 assert.equal((await db.query('SELECT status FROM statement_batches')).rows[0].status,'EXECUTED')
 assert.equal(await count('expenses'),2);assert.equal(await count('distributor_payments'),1)
 await batchCall();assert.equal(await count('expenses'),2)
 const assignHandler=(await import('../server/api/statement/row/[id].put')).default
 const ignoreBody=JSON.stringify({operation:'IGNORE',operationLabel:'Ignore',operationMeta:{},userInput:'ignore',reassign:true}),ignoreRequest=Readable.from([Buffer.from(ignoreBody)]) as any
 ignoreRequest.method='PUT';ignoreRequest.url='/api/statement/row/expense-row';ignoreRequest.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(ignoreBody))}
 const ignoreEvent=createEvent(ignoreRequest,{} as any);ignoreEvent.context.params={id:'expense-row'}
 await assignHandler(ignoreEvent)
 assert.equal((await db.query('SELECT status FROM statement_batches')).rows[0].status,'PENDING')
 assert.equal(await count('expenses'),2,'Assignment retains the old source until replacement executes')
 failMark=true
 await assert.rejects(executeStatementRow('a','test','expense-row','bank-selected'),/marking failure/)
 assert.equal(await count('expenses'),2,'Failed changed-operation execution restores the original source')
 await executeStatementRow('a','test','expense-row','bank-selected')
 assert.equal(await count('expenses'),1,'Changed operation removes only its previously recorded source')
 // #6 is deliberately left as observed; this assertion documents its remaining defect.
 let isoDate=''
 await executeOperation({id:'iso',date:'2026-10-06',description:'',debit:1},'EXPENSE',{categoryId:'cat'},'a',{query:async(sql:string,args:any[])=>{if(sql.startsWith('INSERT INTO expenses'))isoDate=args[1];return {rows:[{id:'cat'}],rowCount:1}}})
 findings.push({name:'ISO statement date parsing',defect:isoDate!=='2026-10-06T00:00:00+05:30',input:'2026-10-06',insertedDate:isoDate})
 for(const name of ['Named-bank statement expense','Zero debit with nonzero credit on supplier statement row','Partially failed batch','Statement retry after execution marking failure']) findings.push({name,defect:false})
 findings.push({name:'Concurrent replay and explicit re-execution',defect:false})
 fs.writeFileSync(`${process.env.ACCOUNTING_REVIEW_DIR}/statement-route-probes.json`,JSON.stringify({at:new Date().toISOString(),method:'Actual statement helper, row service and batch handler with native posting triggers in a disposable schema; marking failures, source scopes, concurrent retries and replacement rollback.',expenseLines,supplierLines,findings},null,2))
 console.log('PASS statement bank postings, zero debit, partial batch retry, atomic rollback, concurrent replay and safe replacement; ISO gap #6 retained')
} finally {
 ;(serverPool as any).connect=originalConnect;(serverPool as any).query=originalQuery
 await db.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();await serverPool.end()
}
