import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {test} from 'node:test';
import ts from 'typescript';
const file=(path:string)=>process.env.READ_SETTINGS_SOURCE_DIR?resolve(process.env.READ_SETTINGS_SOURCE_DIR,path):path;
function evaluate(source:string,bindings:Record<string,any>){
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/export (async )?function /g,'$1function ');
  return new Function(...Object.keys(bindings),js)(...Object.values(bindings));
}
function route(path:string,router:string,url:string,bindings:Record<string,any>){
  const source=readFileSync(file(path),'utf8'),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  for(const node of ast.statements)if(ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)){
    const call=node.expression;if(call.expression.getText(ast)!==router+'.get'||(call.arguments[0] as any).text!==url)continue;
    return evaluate(`return (${call.arguments[1].getText(ast)});`,{asyncHandler:(fn:any)=>fn,...bindings});
  }
  throw Error('GET route not found: '+url);
}
for(const existing of [false,true])test(`accounting preference GET uses reads only (${existing?'saved':'default'} settings)`,async()=>{
  const saved={id:'fixture-preference',companyId:'branch',fyStartMonth:10,allowSelfApproval:true};let output:any;
  const handler=route('server/utils/accountant/management.ts','accountantManagementRouter','/preferences',{
    prisma:{accountantPreference:{findUnique:async({where}:any)=>{assert.equal(where.companyId,'branch');return existing?saved:null;},
      upsert:async()=>{throw Error('GET attempted a preference upsert');}}},
  });
  await handler({user:{companyId:'branch'}},{json:(value:any)=>{output=value;}});
  if(existing)assert.deepEqual(output,saved);
  else{assert.deepEqual(output,{companyId:'branch',fyStartMonth:4,recurringChildStatus:'DRAFT',allowThirteenthMonth:false,
    journalApprovalType:'NONE',allowSelfApproval:false,unrealizedGainAccountId:null,unrealizedLossAccountId:null,journalCustomFields:[]});assert.equal(output.id,undefined);}
});
for(const existing of [false,true])test(`investment settings GET never provisions an account (${existing?'configured':'unconfigured'})`,async()=>{
  const source=readFileSync(file('server/utils/accountant/investor-profits.ts'),'utf8'),ast=ts.createSourceFile('profit.ts',source,ts.ScriptTarget.Latest,true);
  const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&['investmentSettings','readInvestmentSettings'].includes(node.name?.text||'')).map(node=>node.getText(ast)).join('\n');
  const account={id:'distribution',category:'EQUITY'};let excluded:any,output:any;
  const db={auditLog:{findFirst:async()=>existing?{after:{accountId:account.id}}:null},company:{findUnique:async()=>({currency:'INR'})},
    accountingAccount:{findFirst:async()=>null,create:async()=>{throw Error('GET attempted to provision an investment account');},
      findMany:async({where}:any)=>{excluded=where.id.notIn;return [account];}}};
  const helpers=evaluate(functions+`;return {investmentSettings,readInvestmentSettings:typeof readInvestmentSettings==='function'?readInvestmentSettings:undefined};`,{db,fundingAccount:async(id:string)=>{assert.equal(id,account.id);return account;}});
  const handler=route('server/utils/accountant/investor-profits.ts','investorProfitRouter','/settings',{
    ...helpers,db,query:async()=>[{accounts:null},{accounts:{capital:'individual-capital',profit:null}}],
  });
  await handler({}, {json:(value:any)=>{output=value;}});
  assert.deepEqual(output,{accountId:existing?account.id:null,accounts:[account]});assert.deepEqual(excluded,['individual-capital']);
});
