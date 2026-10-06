import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { createEvent } from 'h3';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope';
import { prisma } from '../server/prisma';
import { pool } from '../server/db';

function files(dir:string):string[] { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]); }
const runtime=files('server').filter(file=>file.endsWith('.ts'));
assert.doesNotMatch(fs.readFileSync('server/utils/account-ledger.ts','utf8'),/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER)\s|ensureAccountLedgerSchema|rebuildAccountLedger|recalculateAccountLedgerBalances/,'Runtime archive module must contain readers only');
for(const root of ['pages','components','composables']) for(const file of files(root).filter(f=>/\.(ts|vue)$/.test(f))) {
  if(file.startsWith(`pages${path.sep}accounts${path.sep}`))continue;
  assert.doesNotMatch(fs.readFileSync(file,'utf8'),/useFind\w*BankAccount|useFind\w*CashAccount|lib\/(?:company-)?hooks\/(?:bank-account|cash-account|account-ledger-entry)|account-ledger|scripts\/lib\/legacy-account-ledger/,`Source UI still imports old accounting: ${file}`);
}
const reads=new Set(['cashledger.get.ts','creditledger.get.ts','primaryledger.get.ts','secondaryledger.get.ts']);
let retired=0;
const session={data:{id:'staff',companyId:'company',role:'manager'}};
Object.assign(globalThis,{requireAuthSession:async()=>session});
const connect=pool.connect,query=pool.query;
(pool as any).connect=async()=>{throw Error('Retired route touched the database');};
(pool as any).query=async()=>{throw Error('Retired route touched the database');};
try {
  for(const file of runtime) {
    const source=fs.readFileSync(file,'utf8');
    assert.doesNotMatch(source,/scripts\/lib\/legacy-account-ledger/,file);
    if(!file.endsWith('secondaryledger.get.ts') && !file.endsWith('account-ledger.ts')) assert.doesNotMatch(source,/bank_accounts/,file);
    if(file.endsWith('account-ledger.ts'))continue;
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    for(const node of ast.statements)if(ts.isImportDeclaration(node)&&String((node.moduleSpecifier as any).text).endsWith('account-ledger')){
      assert.ok(reads.has(path.basename(file)),`Operational code still imports legacy accounting: ${file}`);
      assert.match(node.getText(ast),/accountLedgerRowsForApi/);
    }
    assert.doesNotMatch(source,/account_ledger_entries|rebuildAccountLedger|deleteAccountLedger|ensureAccountLedgerSchema/,file);
    if(source.includes('rejectLegacyAccountingWrite')) {
      if(!file.includes(`${path.sep}api${path.sep}`))continue;
      const handler=(await import(pathToFileURL(path.resolve(file)).href)).default;
      const req=Readable.from([]) as any;req.method='POST';req.url='/api/accounts/banks';req.headers={};
      const event=createEvent(req,{} as any);event.context.authorizedCompanyIds=Promise.resolve(['company']);
      await assert.rejects(handler(event),(error:any)=>error.statusCode===410,file);
      event.context.authorizedCompanyIds=Promise.resolve(['other']);
      await assert.rejects(handler(event),(error:any)=>error.statusCode===403,'Scope checked before archive response');
      retired++;
    }
  }
  assert.equal(retired,15);
  const models=['accountLedgerEntry','moneyTransaction','accountTransfer','investment','bankAccount','cashAccount'];
  let calls=0;
  const fake:any={$transaction:async(fn:any)=>fn(fake)};
  for(const model of models)fake[model]={findMany:async()=>[],...Object.fromEntries(['create','createMany','createManyAndReturn','update','updateMany','updateManyAndReturn','delete','deleteMany','upsert'].map(operation=>[operation,async()=>{calls++;}]))};
  fake.company={create:async()=>{calls++;}};
  const scoped:any=scopeOrganizationModelReads(fake,'company',['company']);
  for(const model of models){assert.deepEqual(await scoped[model].findMany({}),[]);for(const operation of ['create','createMany','createManyAndReturn','update','updateMany','updateManyAndReturn','delete','deleteMany','upsert'])await assert.rejects(scoped[model][operation]({}),(e:any)=>e.statusCode===410);}
  const { Prisma }=await import('@prisma/client');
  const company=Prisma.dmmf.datamodel.models.find(m=>m.name==='Company')!;
  const archiveRelations=company.fields.filter(f=>f.kind==='object'&&models.includes(f.type[0].toLowerCase()+f.type.slice(1)));
  assert.equal(archiveRelations.length,6);
  for(const field of archiveRelations) {
    for(const operation of ['create','createMany','update','updateMany','upsert','delete','deleteMany','connectOrCreate'])
      await assert.rejects(scoped.company.create({data:{id:'company',name:'x',[field.name]:{[operation]:{companyId:'company'}}}}),(e:any)=>e.statusCode===410);
  }
  assert.equal(calls,0,'Generated legacy writes never reach the database');
  for(const file of ['pages/accounts.vue','pages/accounts/bank/index.vue','pages/accounts/bank/[id].vue','pages/accounts/investment.vue','pages/settings/store.vue','components/Accounts/List.vue']) {
    const source=fs.readFileSync(file,'utf8'),result=parse(source,{filename:file});assert.deepEqual(result.errors,[],file);
    const script=compileScript(result.descriptor,{id:file});
    const template=compileTemplate({source:result.descriptor.template!.content,filename:file,id:file,compilerOptions:{bindingMetadata:script.bindings}});
    assert.deepEqual(template.errors,[],file);
    assert.doesNotMatch(source,/\/api\/accounts\/(?:investments|banks|primary-bank|opening-balances|transactions)|\/api\/statement\/upload/,file);
  }
  const {executeOperation,deleteExecutedRecord}=await import('../server/api/statement/_helpers');
  for(const operation of ['TRANSFER','TRANSACTION','INVESTMENT']){
    await assert.rejects(executeOperation({id:'row',description:'',debit:10,date:'2026-10-06'},operation,{},'company'),/read-only/);
    await assert.rejects(deleteExecutedRecord(operation,{operationId:'old',insertedData:{company_id:'company'}}),/read-only/);
  }
  console.log(`PASS ${retired} retired routes with scope checks; 54 direct and 48 nested generated write denials; archive reads; statement denials; source dependency scan; 6 Vue files compiled.`);
} finally {(pool as any).connect=connect;(pool as any).query=query;await pool.end();await prisma.$disconnect();}
