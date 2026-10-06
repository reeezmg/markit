import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { pool } from '../server/db';
import { transferGraph, executeCompanyTransfer } from '../server/utils/companyTransfer';
import { legacyLedgerGuard } from './legacy-ledger-guard';
const db=await pool.connect();
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
async function fixture(name:string,values:any){
 const model=Prisma.dmmf.datamodel.models.find(m=>m.name===name)!;const data:any={};
 for(const f of model.fields){
  if(f.kind==='object'||!f.isRequired||(f.hasDefaultValue&&!['id','createdAt','updatedAt'].includes(f.name)))continue;
  data[f.name]=f.isList?[]:f.kind==='enum'?Prisma.dmmf.datamodel.enums.find(e=>e.name===f.type)!.values[0].name:
   f.type==='DateTime'?new Date():f.type==='Boolean'?false:['Float','Int','Decimal','BigInt'].includes(f.type)?0:f.type==='Json'?'{}':f.name==='id'?randomUUID():'Verification';
 }
 Object.assign(data,values);const fields=Object.entries(data);
 await db.query(`INSERT INTO ${quote(model.dbName||name)} (${fields.map(([k])=>quote(model.fields.find(f=>f.name===k)!.dbName||k)).join(',')}) VALUES (${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(([,v])=>v));return data.id;
}
try{
 await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");
 const schema=new URL(process.env.DATABASE_URL!).searchParams.get('schema')||'public';assert.match(schema,/^[A-Za-z_][A-Za-z0-9_]*$/);await db.query(`SET LOCAL search_path TO "${schema}"`);
 const companies=(await db.query(`SELECT s.company_id,(SELECT id FROM categories WHERE company_id=s.company_id ORDER BY id LIMIT 1) category_id FROM accountant_v2_erp_settings s WHERE s.enabled ORDER BY s.company_id`)).rows.filter(r=>r.category_id);
 assert.ok(companies.length>=2,'Two connected companies with categories required');
 const [source,destination]=companies;
 const bill=await fixture('Bill',{companyId:source.company_id,createdAt:new Date(),subtotal:100,grandTotal:100,paymentMethod:'Cash',paymentStatus:'PAID',type:'BILL',deleted:false,isMarkit:false});
 await fixture('Entry',{companyId:source.company_id,billId:bill,categoryId:source.category_id,name:'Rollback transfer verification',qty:1,rate:100,tax:0,value:100});
 const archive=await fixture('AccountLedgerEntry',{companyId:source.company_id,accountType:'CASH',direction:'CREDIT',amount:100,sourceType:'BILL',sourceId:bill,entryDate:new Date(),balanceAfter:100});
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
 const unchanged=await legacyLedgerGuard(db);
 const posting=(await db.query('SELECT journal_id FROM accountant_v2_erp_sources WHERE company_id=$1 AND source_key=$2',[source.company_id,'bill:'+bill])).rows[0];assert.ok(posting.journal_id);
 const input={model:'Bill',id:bill,sourceCompanyId:source.company_id,companyId:destination.company_id};
 const graph=await transferGraph(db,input);
 assert.ok(![...graph.nodes.values()].some(n=>n.model==='AccountLedgerEntry'),'Archive excluded from transfer graph');
 await executeCompanyTransfer(db,{...input,fingerprint:graph.fingerprint,includeLinked:true,mappings:{['Category:'+source.category_id]:destination.category_id}});
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
 await unchanged();
 assert.equal((await db.query('SELECT company_id FROM account_ledger_entries WHERE id=$1',[archive])).rows[0].company_id,source.company_id);
 const after=(await db.query('SELECT company_id,journal_id FROM accountant_v2_erp_sources WHERE source_key=$1',['bill:'+bill])).rows;
 assert.equal(after.find(r=>r.company_id===source.company_id).journal_id,null);
 assert.ok(after.find(r=>r.company_id===destination.company_id).journal_id);
 assert.equal((await db.query('SELECT count(*)::int n FROM accountant_v2_manual_journals WHERE reversed_from_id=$1',[posting.journal_id])).rows[0].n,1);
 console.log('PASS company transfer: source native journal reversed, destination posted, logical legacy bill entry and entire archive unchanged.');
}finally{await db.query('ROLLBACK');db.release();await pool.end();console.log('All transfer fixtures and journals rolled back.');}
