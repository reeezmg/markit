import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
test('supplier refresh waits for asynchronous page hydration and still refreshes on activation',()=>{
 const source=readFileSync(process.env.DISTRIBUTOR_PAGE_SOURCE||'pages/distributor/index.vue','utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
 const ast=ts.createSourceFile('distributor.ts',source,ts.ScriptTarget.Latest,true);
 const statements=ast.statements.filter(n=>
  (ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='supplierHydrated'))||
  (ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&['onMounted','onActivated','onNuxtReady'].includes(n.expression.expression.getText(ast))&&n.getText(ast).includes('refetch()'))
 ).map(n=>n.getText(ast)).join('\n');
 let calls=0;const mounted:Function[]=[],activated:Function[]=[],ready:Function[]=[];
 const js=ts.transpileModule(statements,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('refetch','onMounted','onActivated','onNuxtReady',js)(()=>{calls++;},(fn:Function)=>mounted.push(fn),(fn:Function)=>activated.push(fn),(fn:Function)=>ready.push(fn));
 mounted.forEach(fn=>fn());activated.forEach(fn=>fn());assert.equal(calls,0,'No explicit refresh may replace the server error/loading state during hydration');
 ready.forEach(fn=>fn());assert.equal(calls,1);activated.forEach(fn=>fn());assert.equal(calls,2);
});
