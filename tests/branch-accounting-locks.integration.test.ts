import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { writeFileSync } from 'node:fs';
import { createError,createEvent,defineEventHandler,getHeader,getQuery,getRequestURL,readBody } from 'h3';
import {pool} from '../server/db';
import {prisma} from '../server/prisma';
const db=await pool.connect(),connect=pool.connect.bind(pool),poolQuery=pool.query.bind(pool);
let depth=0;const results:any[]=[];
async function query(sql:string,args?:any[]){
 if(sql==='BEGIN')return db.query(`SAVEPOINT controls_${++depth}`);
 if(sql==='COMMIT'){
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
  return db.query(`RELEASE SAVEPOINT controls_${depth--}`);
 }
 if(sql==='ROLLBACK'){
  const savepoint=`controls_${depth--}`;await db.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);return db.query(`RELEASE SAVEPOINT ${savepoint}`);
 }
 return db.query(sql,args);
}
try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 await db.query("SET LOCAL lock_timeout='5s'");
 const companies=(await db.query(`SELECT c.id,CASE WHEN c.is_head_office THEN 'head' ELSE 'branch' END role,
  (SELECT user_id FROM company_users WHERE company_id=c.id AND NOT deleted AND status LIMIT 1) user_id,
  (SELECT id FROM expense_categories WHERE company_id=c.id LIMIT 1) category
  FROM companies c JOIN accountant_v2_erp_settings s ON s.company_id=c.id AND s.enabled
  WHERE c.is_head_office OR c.parent_company_id IS NOT NULL ORDER BY c.is_head_office DESC,c.id`)).rows;
 assert.ok(companies.some(c=>c.role==='head')&&companies.some(c=>c.role==='branch'));
 const session={data:{id:'',companyId:'',role:'admin'}};
 Object.assign(globalThis,{createError,defineEventHandler,getHeader,getQuery,getRequestURL,readBody,
  requireAuthSession:async()=>session,useAuthSession:async()=>session});
 (pool as any).connect=async()=>({query,release(){}});(pool as any).query=query;
 const middleware=(await import('../server/middleware/company-request')).default;
 const create=(await import('../server/api/accounts/expenses.post')).default;
 for(const company of companies){
  assert.ok(company.user_id&&company.category);session.data.id=company.user_id;session.data.companyId=company.id;
  async function snapshot(){const values:any={};
   for(const table of ['expenses','companies','accountant_v2_erp_sources','accountant_v2_manual_journals','accountant_v2_manual_journal_lines','account_ledger_entries'])
    values[table]=(await db.query(`SELECT count(*)::text count,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) hash FROM ${table} t WHERE ${table==='companies'?'id':'company_id'}=$1`,[company.id])).rows[0];
   return values;
  }
  const lock=randomUUID();
  await db.query(`INSERT INTO accountant_v2_transaction_locks(id,company_id,module,lock_date,reason,locked_by_id,updated_at)
   VALUES($1,$2,'ALL',now()+interval '1 day','BRANCH_E2E_LOCK', $3,now())`,[lock,company.id,company.user_id]);
  const before=await snapshot();
  const body=JSON.stringify({companyId:company.id,userId:company.user_id,expensecategoryId:company.category,
   expenseDate:new Date().toISOString(),totalAmount:118,taxAmount:18,recoverableTaxAmount:8,status:'Paid',paymentMode:'CASH',note:'BRANCH_E2E_LOCK_REJECTION'});
  const req=Readable.from([Buffer.from(body)]) as any;req.method='POST';req.url='/api/accounts/expenses';
  req.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(body)),'x-company-id':company.id};
  const event=createEvent(req,{} as any);event.context.authorizedCompanyIds=Promise.resolve([company.id]);await middleware(event);
  await assert.rejects(create(event),/lock/i,'Locked periods must reject the whole expense transaction');
  assert.equal(depth,0);assert.deepEqual(await snapshot(),before,'Rejected save leaves source, counter, journals and archived ledger unchanged');
  await db.query('DELETE FROM accountant_v2_transaction_locks WHERE id=$1 AND company_id=$2',[lock,company.id]);
  results.push({company:company.role,status:'passed',checks:['locked-period-rejected','source-and-number-counter-unchanged','journals-unchanged','legacy-ledger-unchanged']});
  console.log('PASS '+company.role+': accounting lock rejects save atomically');
 }
}finally{
 (pool as any).connect=connect;(pool as any).query=poolQuery;await db.query('ROLLBACK');db.release();await pool.end();await prisma.$disconnect();
 writeFileSync('tests/branch-reports/branch-accounting-locks.json',JSON.stringify({at:new Date().toISOString(),schemaChanges:false,results,cleanup:'All lock fixtures and transaction effects rolled back'},null,2));
}
