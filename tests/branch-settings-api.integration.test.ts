import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {writeFileSync} from 'node:fs';
import {createError,createEvent,defineEventHandler,getHeader,getQuery,getRequestURL,readBody} from 'h3';
import {prisma} from '../server/prisma';
import {pool} from '../server/db';
import {accountantContext} from '../server/utils/accountant/context';
import {initializeNewCompanyAccounts} from '../server/utils/accountant/company-account-defaults';
import {accountSettingsRouter} from '../server/utils/accountant/account-settings';
import {configureErpAccounting,erpAccountingSettings} from '../server/utils/accountant/erp';
import {configureUserAccounting,userAccountingSettings} from '../server/utils/accountant/users';
import {accountDefaultGroups,acceptsDefaultAccount} from '../utils/account-defaults';
import {prismaSqlClient} from '../server/utils/prisma-sql-client';
const userId=randomUUID(),head=randomUUID(),companies=[head],rollback=new Error('Owned settings rollback');
const transaction=prisma.$transaction.bind(prisma),connect=pool.connect.bind(pool),poolQuery=pool.query.bind(pool);
const member=prisma.companyUser.findUnique.bind(prisma.companyUser),preference=prisma.generalPreference.findUnique.bind(prisma.generalPreference);
const report:any={startedAt:new Date().toISOString(),schemaChanges:false,results:[],fixtureIds:{userId,companies},cleanup:'pending'};
const headScope=process.env.SETTINGS_HEAD_SCOPE==='1'; let requestCompany='';
const companyRead=prisma.company.findUniqueOrThrow.bind(prisma.company),companyFind=prisma.company.findUnique.bind(prisma.company),categoryFind=prisma.expenseCategory.findFirst.bind(prisma.expenseCategory);
const session={data:{id:userId,companyId:head,role:'admin'}};
Object.assign(globalThis,{createError,createEvent,defineEventHandler,eventHandler:defineEventHandler,getHeader,getQuery,getRequestURL,readBody,
 requireAuthSession:async()=>session,useAuthSession:async()=>session});
try{
 await transaction(async tx=>{
  await tx.user.create({data:{id:userId,email:'settings-'+userId+'@example.invalid',password:'unused-fixture'}});
  await tx.company.create({data:{id:head,name:'SETTINGS_E2E_HEAD',type:'seller',plan:'pro',isHeadOffice:true,category:[],deliveryType:[],deliveryMode:[],productinput:{create:{}},variantinput:{create:{}}}});
  await tx.companyUser.create({data:{companyId:head,userId,name:'Settings fixture',role:'admin',code:1}});
  await initializeNewCompanyAccounts(tx,head,userId);
  (prisma as any).$transaction=async(fn:any)=>fn(tx);
  (prisma.companyUser as any).findUnique=(args:any)=>args.where.companyId_userId?.userId===userId?tx.companyUser.findUnique(args):member(args);
  (prisma.generalPreference as any).findUnique=(args:any)=>companies.includes(args.where.companyId_pageName_key?.companyId)?tx.generalPreference.findUnique(args):preference(args);
  (prisma.company as any).findUniqueOrThrow=(args:any)=>companies.includes(args.where.id)?tx.company.findUniqueOrThrow(args):companyRead(args);
  (prisma.company as any).findUnique=(args:any)=>companies.includes(args.where.id)?tx.company.findUnique(args):companyFind(args);
  (prisma.expenseCategory as any).findFirst=(args:any)=>companies.includes(args.where?.companyId)?tx.expenseCategory.findFirst(args):categoryFind(args);
  const sql=prismaSqlClient(tx);let depth=0;
  const query=async(statement:string,args:any[]=[])=>{
   if(statement==='BEGIN'){await tx.$executeRawUnsafe(`SAVEPOINT settings_${++depth}`);return{rows:[],rowCount:0};}
   if(statement==='COMMIT'){await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED');await tx.$executeRawUnsafe(`RELEASE SAVEPOINT settings_${depth--}`);return{rows:[],rowCount:0};}
   if(statement==='ROLLBACK'){const name=`settings_${depth--}`;await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);return{rows:[],rowCount:0};}
   assert.doesNotMatch(statement,/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|SCHEMA|INDEX|TRIGGER|FUNCTION)\b/i);
   return sql.query(statement,args);
  };
  (pool as any).query=query;(pool as any).connect=async()=>({query,release(){}});
  async function api(handler:any,method:string,path:string,body?:any){
   const data=JSON.stringify(body??{}),req=Readable.from([Buffer.from(data)]) as any;
   req.method=method;req.url=path;req.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(data)),'x-company-id':requestCompany||session.data.companyId};
   const event=createEvent(req,{} as any);event.context.authorizedCompanyIds=Promise.resolve(session.data.companyId===head?companies:[session.data.companyId]);return handler(event);
  }
  const branchCreate=(await import('../server/api/branches/index.post')).default;
  const branch=await api(branchCreate,'POST','/api/branches',{name:'SETTINGS_E2E_BRANCH',city:'Fixture city'});companies.push(branch.id);
  assert.equal(await tx.accountantAccountingAccount.count({where:{companyId:branch.id}}),38);
  session.data.companyId=branch.id;
  await assert.rejects(api(branchCreate,'POST','/api/branches',{name:'Forbidden subbranch'}),{statusCode:409});
  const saveFields=(await import('../server/api/product-custom-fields/index.post')).default;
  const getFields=(await import('../server/api/product-custom-fields/index.get')).default;
  const putPrint=(await import('../server/api/settings/print-templates.put')).default;
  const getPrint=(await import('../server/api/settings/print-templates.get')).default;
  const startYear=(await import('../server/api/bill/startNewYear.post')).default;
  const dimensions=(await import('../server/api/product-inputs.get')).default;
  const context=(await import('../server/api/organization/context.get')).default;
  const fieldIds=companies.map(()=>randomUUID());
  const allAccounts=await tx.accountantAccountingAccount.findMany({where:{companyId:{in:companies},isActive:true}});
  for(const[index,companyId]of companies.entries()){
   session.data.companyId=headScope?head:companyId;requestCompany=companyId;const sessionBefore=JSON.stringify(session.data);const role=index===0?'head':headScope?'branch-managed-from-head':'branch';
   const snapshot=await api(context,'GET','/api/organization/context?companyId='+companyId);assert.equal(snapshot.companyId,companyId);
   const flags=await api(dimensions,'GET','/api/product-inputs');assert.equal(typeof flags.productDimension,'boolean');
   const field={id:fieldIds[index],scope:'PRODUCT',label:'Material',type:'TEXT',required:false,active:true};
   await api(saveFields,'POST','/api/product-custom-fields',{fields:[field]});
   const original=await api(getFields,'GET','/api/product-custom-fields');assert.equal(original.fields[0].key,'material');
   await api(saveFields,'POST','/api/product-custom-fields',{fields:[{...field,key:'material',label:'Fabric',type:'SELECT',options:['Cotton','Cotton','Silk']}]});
   const reloaded=await api(getFields,'GET','/api/product-custom-fields');assert.equal(reloaded.fields[0].label,'Fabric');assert.equal(reloaded.fields[0].key,'material');assert.deepEqual(reloaded.fields[0].options,['Cotton','Silk']);
   await assert.rejects(api(saveFields,'POST','/api/product-custom-fields',{}),{statusCode:400});
   await assert.rejects(api(saveFields,'POST','/api/product-custom-fields',{fields:[{...field,type:'SELECT',options:[]}]}),{statusCode:400});
   await assert.rejects(api(saveFields,'POST','/api/product-custom-fields',{fields:[field,field]}),{statusCode:400});
   if(index===1)await assert.rejects(api(saveFields,'POST','/api/product-custom-fields',{fields:[{...field,id:fieldIds[0]}]}),{statusCode:403});
   assert.deepEqual(await api(getFields,'GET','/api/product-custom-fields'),reloaded,'Rejected replace preserves definitions');
   const design={version:1,templates:[],receiptId:'builtin:no-tax-receipt',labelId:null};
   await api(putPrint,'PUT','/api/settings/print-templates',design);assert.deepEqual(await api(getPrint,'GET','/api/settings/print-templates'),design);
   await api(putPrint,'PUT','/api/settings/print-templates',{...design,receiptId:null});
   const backup=await tx.generalPreference.findUniqueOrThrow({where:{companyId_pageName_key:{companyId,pageName:'printer',key:'templates-backup'}}});assert.deepEqual(backup.value,design);
   session.data.role='user';await assert.rejects(api(putPrint,'PUT','/api/settings/print-templates',design),{statusCode:403});session.data.role='admin';
   const beforeClose=await tx.company.findUniqueOrThrow({where:{id:companyId}});
   await assert.rejects(api(startYear,'POST','/api/bill/startNewYear',{companyId,closingDate:'invalid-date'}),{statusCode:400});
   await assert.rejects(api(startYear,'POST','/api/bill/startNewYear',{companyId:companies[index===0?1:0],closingDate:'2026-04-01'}),{statusCode:403});
   session.data.role='user';await assert.rejects(api(startYear,'POST','/api/bill/startNewYear',{companyId,closingDate:'2026-04-01'}),{statusCode:403});session.data.role='admin';
   assert.equal((await tx.company.findUniqueOrThrow({where:{id:companyId}})).billCounter,beforeClose.billCounter);
   // Only owned zero-value fixture bills are renumbered, inside the outer rollback.
   const oldBill=randomUUID(),newBill=randomUUID();
   await tx.bill.create({data:{id:oldBill,companyId,createdAt:new Date('2026-03-01'),grandTotal:0}});
   await tx.bill.create({data:{id:newBill,companyId,createdAt:new Date('2026-05-01'),grandTotal:0}});
   const oldNumber=(await tx.bill.findUniqueOrThrow({where:{id:oldBill}})).invoiceNumber;
   const reset=await api(startYear,'POST','/api/bill/startNewYear',{companyId,closingDate:'2026-04-01'});
   assert.equal(reset.counters.billCounter,2);assert.equal((await tx.bill.findUniqueOrThrow({where:{id:newBill}})).invoiceNumber,1);
   assert.equal((await tx.bill.findUniqueOrThrow({where:{id:oldBill}})).invoiceNumber,oldNumber);
   await accountantContext.run({companyId,userId,role:'admin',db:tx},async()=>{
    const call=async(method:string,path:string,body:any={})=>{let result:any;await accountSettingsRouter.dispatch(method,path,{user:{companyId,userId,role:'admin'},body,params:{},query:{}},{json:(value:any)=>result=value,status:()=>{}} as any);return result;};
    const accounts=allAccounts.filter(a=>a.companyId===companyId),foreign=allAccounts.filter(a=>a.companyId!==companyId);let selectors=0;
    for(const[key,group]of Object.entries(accountDefaultGroups)){
     const mappings:Record<string,string>={};
     for(const[field,spec]of Object.entries(group.fields)){const account=accounts.find(a=>acceptsDefaultAccount(spec,a)&&!(key==='transfers'&&Object.values(mappings).includes(a.id)));assert.ok(account);mappings[field]=account.id;selectors++;}
     await call('PUT','/'+key,{mappings});assert.deepEqual((await call('GET','/defaults')).defaults[key],mappings);
     const [first,spec]=Object.entries(group.fields)[0];const other=foreign.find(a=>acceptsDefaultAccount(spec,a));assert.ok(other);
     await assert.rejects(call('PUT','/'+key,{mappings:{...mappings,[first]:other.id}}));
     assert.deepEqual((await call('GET','/defaults')).defaults[key],mappings);
    }
    assert.equal(selectors,20);
    await call('PUT','/receive-pay',{receiveAccountId:'',payAccountId:''});const cleared=(await call('GET','/defaults')).defaults;assert.deepEqual(cleared.receive,{});assert.deepEqual(cleared.pay,{});
    const erp=await erpAccountingSettings();await configureErpAccounting({...erp.mappings});assert.deepEqual((await erpAccountingSettings()).mappings,erp.mappings);assert.equal((await erpAccountingSettings()).enabled,false);
    const staff=await userAccountingSettings();await configureUserAccounting({...staff.mappings});assert.deepEqual((await userAccountingSettings()).mappings,staff.mappings);assert.equal((await userAccountingSettings()).enabled,false);
    report.results.push({company:role,status:'passed',accountDefaultSelectors:selectors,checks:['account-defaults-save-reload-all-groups','foreign-accounts-rejected','clearing-defaults','erp-and-staff-mapping-roundtrip-without-activation','custom-fields-create-edit-stable-key','invalid-and-foreign-field-replacement-rejected','print-preferences-save-reload-backup','print-save-role-denied','financial-year-role-company-date-validation','financial-year-fixture-bill-numbering']});
   });
   assert.equal(JSON.stringify(session.data),sessionBefore,'Scoped settings APIs leave the authentication session unchanged');
  }
  if(headScope){
   session.data.companyId=branch.id;requestCompany=head;await assert.rejects(api(getFields,'GET','/api/product-custom-fields'),{statusCode:403});
   await assert.rejects(api(dimensions,'GET','/api/product-inputs'),{statusCode:403});
   await assert.rejects(api(context,'GET','/api/organization/context?companyId='+head),{statusCode:403});
  }
  requestCompany=head;session.data.companyId=head;assert.equal((await api(getFields,'GET','/api/product-custom-fields')).fields[0].label,'Fabric');
  assert.equal(depth,0);throw rollback;
 },{maxWait:15000,timeout:300000}).catch(error=>{if(error!==rollback)throw error;});
}catch(error:any){report.error={message:error.statusMessage||error.message,code:error.code};process.exitCode=1;}
finally{
 prisma.company.findUniqueOrThrow=companyRead;prisma.company.findUnique=companyFind;prisma.expenseCategory.findFirst=categoryFind;
 (prisma as any).$transaction=transaction;prisma.companyUser.findUnique=member;prisma.generalPreference.findUnique=preference;(pool as any).connect=connect;(pool as any).query=poolQuery;
 assert.equal(await prisma.company.count({where:{id:{in:companies}}}),0);assert.equal(await prisma.user.count({where:{id:userId}}),0);
 report.cleanup='verified: all owned companies/users/accounts/fields/preferences and transaction effects rolled back';report.finishedAt=new Date().toISOString();
 writeFileSync(headScope?'tests/branch-reports/settings-head-scope-api.json':'tests/branch-reports/settings-api-expanded.json',JSON.stringify(report,null,2));await prisma.$disconnect();await pool.end();console.log(report.error?'FAIL: settings-api-expanded.json':'PASS both-role settings APIs/defaults and rollback cleanup');
}
