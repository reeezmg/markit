import 'dotenv/config';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {pool} from '../server/db';
import {transferGraph,executeCompanyTransfer} from '../server/utils/companyTransfer';
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
 await db.query('BEGIN');await db.query('SET LOCAL search_path TO public');
 const source='02856c86-60b8-41a4-ba18-79dbd55bf016',destination='5271d5cb-2e97-4303-85c0-3fc9e3e6bb05';
 const categories=(await db.query('SELECT DISTINCT ON(company_id) id,company_id FROM categories WHERE company_id=ANY($1::text[]) ORDER BY company_id,id',[[source,destination]])).rows;
 const sourceCat=categories.find(c=>c.company_id===source).id,targetCat=categories.find(c=>c.company_id===destination).id;
 const bill=await fixture('Bill',{companyId:source,createdAt:new Date(),subtotal:100,grandTotal:100,paymentMethod:'Cash',paymentStatus:'PAID',type:'BILL',deleted:false,isMarkit:false});
 await fixture('Entry',{companyId:source,billId:bill,categoryId:sourceCat,name:'Rollback transfer verification',qty:1,rate:100,tax:0,value:100});
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
 const before=(await db.query('SELECT company_id,journal_id,accounts FROM accountant_v2_erp_sources WHERE source_key=$1 ORDER BY company_id',['bill:'+bill])).rows;
 assert.equal(before.length,1);assert.ok(before[0].journal_id);
 const input={model:'Bill',id:bill,sourceCompanyId:source,companyId:destination};
 const graph=await transferGraph(db,input);
 await executeCompanyTransfer(db,{...input,fingerprint:graph.fingerprint,includeLinked:true,mappings:{['Category:'+sourceCat]:targetCat}});
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
 const after=(await db.query('SELECT company_id,journal_id FROM accountant_v2_erp_sources WHERE source_key=$1 ORDER BY company_id',['bill:'+bill])).rows;
 const original=(await db.query('SELECT count(*)::int n FROM accountant_v2_manual_journals WHERE reversed_from_id=$1',[before[0].journal_id])).rows[0].n;
 const destinationLines=(await db.query(`SELECT a.account_type,l.side,l.amount FROM accountant_v2_erp_sources s JOIN accountant_v2_manual_journal_lines l ON l.journal_id=s.journal_id JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id WHERE s.company_id=$1 AND s.source_key=$2 ORDER BY a.account_type`,[destination,'bill:'+bill])).rows;
 const correct=after.find(r=>r.company_id===source)?.journal_id===null&&!!after.find(r=>r.company_id===destination)?.journal_id&&original===1&&destinationLines.some(l=>l.account_type==='CASH'&&Number(l.amount)===100);
 const result={at:new Date().toISOString(),method:'Real company-transfer service and installed ERP triggers; outer transaction always rolled back.',passed:correct,sourceReversed:original===1,sourcePostingCleared:after.find(r=>r.company_id===source)?.journal_id===null,destinationLines};
 fs.writeFileSync('scripts/production-accounting/runs/workflow-review-2026-10-06/connected-company-transfer-probe.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 assert.ok(correct,'Connected company move must reverse source and post destination');
}finally{await db.query('ROLLBACK');db.release();await pool.end();console.log('Company-transfer probe rolled back.');}
