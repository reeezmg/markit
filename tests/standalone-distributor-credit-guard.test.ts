import assert from 'node:assert/strict';
import {scopeOrganizationModelReads} from '../server/utils/organizationModelScope';
import {prisma} from '../server/prisma';
import {pool} from '../server/db';
let created=0;
const fake:any={
 distributorCredit:{create:async(args:any)=>{created++;return args.data;},findUnique:async()=>({companyId:'company'})},
 purchaseOrder:{create:async(args:any)=>args.data},
 $transaction:async(run:any)=>run(fake),
};
const scoped:any=scopeOrganizationModelReads(fake,'company',['company']);
try {
 const record=await scoped.distributorCredit.create({data:{companyId:'company',amount:100}});
 assert.equal(record.amount,100);assert.equal(created,1,'Standalone Add Credit remains allowed');
 for(const data of [{purchaseOrderId:'po'},{purchaseOrder:{connect:{id:'po'}}},{purchaseOrderId:{set:'po'}}]) {
  await assert.rejects(scoped.distributorCredit.create({data:{companyId:'company',amount:100,...data}}),/standalone/);
 }
 for(const relation of [{create:{amount:100}},{connect:{id:'dc'}},{set:[{id:'dc'}]}]) {
  await assert.rejects(scoped.purchaseOrder.create({data:{companyId:'company',distributorCredit:relation}}),/cannot create or link credits/);
 }
 assert.equal(created,1,'Rejected links never reach the database delegate');
 console.log('Standalone credits allowed; direct and nested PO-credit links rejected without database writes.');
} finally {await pool.end();await prisma.$disconnect();}
