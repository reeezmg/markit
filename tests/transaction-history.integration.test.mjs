import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {importTransactions} from '../scripts/production-accounting/lib/import-transactions.mjs';
const pool=new Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect();
try{
 await db.query('BEGIN');
 const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw Error('Invalid schema');
 await db.query(`SET LOCAL search_path TO "${schema}"`);
 const c=(await db.query('SELECT company_id FROM accountant_v2_erp_settings WHERE enabled ORDER BY company_id LIMIT 1')).rows[0].company_id;
 const first=randomUUID(),second=randomUUID(),pending=randomUUID();
 for(const [ident,dir,mode,status,amount] of [[first,'RECEIVED','CASH','PAID',123.45],[second,'GIVEN','BANK','PAID',20],[pending,'GIVEN','CASH','PENDING',11]]){
  await db.query(`INSERT INTO money_transactions(id,company_id,party_type,direction,payment_mode,status,amount,note,created_at,updated_at) VALUES($1,$2,'OTHER',$3,$4,$5,$6,'Transaction migration test','2099-01-01',now())`,[ident,c,dir,mode,status,amount]);
 }
 async function reject(fn,pattern){await db.query('SAVEPOINT reject_case');try{await assert.rejects(fn,pattern)}finally{await db.query('ROLLBACK TO SAVEPOINT reject_case');await db.query('RELEASE SAVEPOINT reject_case')}}
 await reject(()=>importTransactions(db,c,{through:'2099-01-02'}),/Missing purpose/);
 const result=await importTransactions(db,c,{through:'2099-01-02',clearing:true});
 assert.equal(result.created,2);assert.ok(result.pending>=1);assert.equal(result.rows.find(r=>r.id===first).status,'created');
 assert.equal(result.balanceChanges.reduce((n,r)=>n+Math.round(Number(r.amount)*100),0),0);
 const repeat=await importTransactions(db,c,{through:'2099-01-02',clearing:true});assert.equal(repeat.created,0);assert.equal(repeat.reused,0);assert.deepEqual(repeat.balanceChanges,[]);
 await reject(async()=>{await db.query('UPDATE money_transactions SET amount=1 WHERE id=$1',[first]);await importTransactions(db,c,{through:'2099-01-02',clearing:true})},/source changed/);
 await reject(async()=>{await db.query('DELETE FROM money_transactions WHERE id=$1',[first]);await importTransactions(db,c,{through:'2099-01-02',clearing:true})},/source was deleted/);
 const wrong=(await db.query(`SELECT id FROM accountant_v2_accounting_accounts WHERE company_id<>$1 AND account_type='EXPENSE' LIMIT 1`,[c])).rows[0]?.id;
 if(wrong)await reject(async()=>{const ident=randomUUID();await db.query(`INSERT INTO money_transactions(id,company_id,party_type,direction,payment_mode,status,amount,created_at,updated_at) VALUES($1,$2,'OTHER','GIVEN','CASH','PAID',10,'2099-01-02',now())`,[ident,c]);await importTransactions(db,c,{through:'2099-01-02',mappings:{purposes:{[ident]:wrong}}})},/Invalid money\/purpose/);
 console.log('Transaction history integration passed: existing journal reuse, new balanced receive/pay, pending exclusion, repeat no-op, changed/deleted source detection, foreign account rejection. All fixtures rolled back.');
}finally{await db.query('ROLLBACK');db.release();await pool.end()}
