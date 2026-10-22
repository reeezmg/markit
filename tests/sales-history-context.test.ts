import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {computed,ref} from 'vue';
test('sales-history query callbacks use captured company context after setup',()=>{
  const source=readFileSync(process.env.SALES_HISTORY_SOURCE||'pages/saleshistory/index.vue','utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast=ts.createSourceFile('history.ts',source,ts.ScriptTarget.Latest,true);
  const statements=ast.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['useAuth','queryArgs'].includes(d.name.getText(ast)))).map(n=>n.getText(ast)).join('\n');
  let setup=true;const auth={session:ref({companyId:'head',cleanup:false})};
  const bindings={computed,useNuxtApp:()=>{if(!setup)throw Error('[nuxt] instance unavailable');return{$auth:auth};},companyScope:{auth},
    search:ref(null),selectedStatus:ref([]),selectedDate:ref({start:new Date('2026-10-01'),end:new Date('2026-10-21')}),sort:ref({column:'updatedAt',direction:'desc'}),page:ref(1),pageCount:ref('20')};
  const js=ts.transpileModule(statements,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const query=new Function(...Object.keys(bindings),js+';return queryArgs;')(...Object.values(bindings));setup=false;
  assert.equal(query.value.where.AND[0].companyId,'head');
});
