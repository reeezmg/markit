import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {test} from 'node:test';
import ts from 'typescript';
import {z} from 'zod';
const file=(path:string)=>process.env.STOCK_READER_SOURCE_DIR?resolve(process.env.STOCK_READER_SOURCE_DIR,path):path;
function load(path:string,bindings:Record<string,any>){
  const js=ts.transpileModule(readFileSync(file(path),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    .replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?\r?\n/gm,'').replace('export default','return');
  return new Function(...Object.keys(bindings),js)(...Object.values(bindings));
}
test('stock brand options return scoped Brand identities and labels',async()=>{
  let args:any;
  const handler=load('server/api/options/brands.ts',{defineEventHandler:(fn:any)=>fn,getReadCompanyIds:async()=>['branch'],
    prisma:{product:{findMany:async()=>{throw Error('Brand is a relation, not a product string column');}},brand:{findMany:async(value:any)=>{args=value;return [{id:'brand-fixture',name:'Fixture brand'}];}}}});
  assert.deepEqual(await handler({}),[{label:'Fixture brand',value:'brand-fixture'}]);assert.deepEqual(args.where.companyId,{in:['branch']});
});
test('stock aggregation uses brand names, brand IDs and simultaneous supplier/date filters',async()=>{
  let args:any;
  const handler=load('server/api/stock-aggregate.post.ts',{z,defineEventHandler:(fn:any)=>fn,getReadCompanyIds:async()=>['branch'],readBody:async(event:any)=>event,
    prisma:{variant:{findMany:async(value:any)=>{args=value;return [{sprice:12.5,pprice:5,items:[{qty:2},{qty:-1}],product:{name:'Fixture',brand:{name:'Fixture brand'}}}];}}}});
  const result=await handler({companyId:'head',groupBy:'brand',filters:{category:null,brand:'brand-fixture',rating:null,distributor:'supplier-fixture',startDate:'2026-10-01',endDate:'2026-10-20'}});
  assert.deepEqual(result,[{brand:'fixture brand',stock:12.5,purchaseStock:5,qty:1}]);
  assert.deepEqual(args.where.companyId,{in:['branch']});assert.equal(args.where.product.brandId,'brand-fixture');
  assert.equal(args.where.product.purchaseorder.distributorId,'supplier-fixture');assert.ok(args.where.product.purchaseorder.createdAt.gte instanceof Date);
  assert.ok(args.where.product.purchaseorder.createdAt.lte instanceof Date);assert.ok(args.include.product.include.brand);
});
test('stock grouping handles product names that match prototype keys',async()=>{
  const handler=load('server/api/stock-aggregate.post.ts',{z,defineEventHandler:(fn:any)=>fn,getReadCompanyIds:async()=>['branch'],readBody:async(event:any)=>event,
    prisma:{variant:{findMany:async()=>[{sprice:10,pprice:4,items:[{qty:3}],product:{name:'__proto__'}}]}}});
  assert.deepEqual(await handler({companyId:'branch',groupBy:'product',filters:{category:null,brand:null,rating:null,distributor:null,startDate:null,endDate:null}}),
    [{product:'__proto__',stock:30,purchaseStock:12,qty:3}]);assert.equal(({} as any).stock,undefined);
});
