import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {computed,ref} from 'vue';
test('salary assignment query keys retain the SSR timestamp during hydration',()=>{
  const source=readFileSync(process.env.SALARY_PAGE_SOURCE||'pages/users/salary.vue','utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast=ts.createSourceFile('salary.ts',source,ts.ScriptTarget.Latest,true);
  const statement=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>ts.isCallExpression(d.initializer!)&&d.initializer.expression.getText(ast)==='useFindManyShiftAssignment')) as ts.VariableStatement;
  const call=statement.declarationList.declarations[0].initializer as ts.CallExpression;
  const stamp=ast.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='assignmentAsOf')).map(n=>n.getText(ast)).join('\n');
  const state=new Map();const useState=(key:string,init:any)=>{if(!state.has(key))state.set(key,ref(init()));return state.get(key);};
  const read=(instant:number)=>{
    class Clock extends Date{constructor(value?:any){super(value===undefined?instant:value);}static now(){return instant;}}
    const js=ts.transpileModule(stamp+'\nconst args = '+call.arguments[0].getText(ast)+';',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    return new Function('computed','companyId','Date','useState',js+';return args.value;')(computed,ref('branch'),Clock,useState);
  };
  assert.equal(read(1800000001000).where.OR[1].effectiveTo.gte.getTime(),read(1800000000000).where.OR[1].effectiveTo.gte.getTime());
});
