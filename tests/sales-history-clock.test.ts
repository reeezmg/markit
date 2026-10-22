import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {computed,ref} from 'vue';
import {sub} from 'date-fns';
test('sales-history date filter retains the server clock during hydration',()=>{
  const source=readFileSync(process.env.SALES_HISTORY_SOURCE||'pages/saleshistory/index.vue','utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast=ts.createSourceFile('history.ts',source,ts.ScriptTarget.Latest,true);
  const names=['historyAsOf','selectedDate','useAuth','queryArgs'];
  const statements=ast.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.includes(d.name.getText(ast)))).map(n=>n.getText(ast)).join('\n');
  const state=new Map();
  const useState=(key:string,init:any)=>{if(!state.has(key))state.set(key,ref(init()));return state.get(key);};
  const read=(instant:number)=>{
    class Clock extends Date{constructor(value?:any){super(value===undefined?instant:value);}static now(){return instant;}}
    const bindings={computed,ref,sub,Date:Clock,useState,companyScope:{auth:{session:ref({companyId:'head',cleanup:false})}},search:ref(null),selectedStatus:ref([]),sort:ref({column:'updatedAt',direction:'desc'}),page:ref(1),pageCount:ref('20')};
    const js=ts.transpileModule(statements,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    return new Function(...Object.keys(bindings),js+';return queryArgs.value;')(...Object.values(bindings));
  };
  assert.deepEqual(read(1800000000000),read(1800000005000));
});
