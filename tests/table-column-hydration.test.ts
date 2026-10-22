import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {test} from 'node:test';
import ts from 'typescript';
import {parse} from '@vue/compiler-sfc';
import {createSSRApp,computed,ref,h} from 'vue';
import {renderToString} from '@vue/server-renderer';
for(const page of ['pages/erp/sales.vue','pages/erp/online/index.vue'])test(`${page}: SSR column selection uses stable keys`,async()=>{
  const path=process.env.TABLE_COLUMNS_SOURCE_DIR?resolve(process.env.TABLE_COLUMNS_SOURCE_DIR,page):page;
  const source=parse(readFileSync(path,'utf8')).descriptor.scriptSetup!.content;
  const ast=ts.createSourceFile(page,source,ts.ScriptTarget.Latest,true);
  let expression='';for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)
    if(declaration.name.getText(ast)==='columnsTable')expression=declaration.initializer!.getText(ast);
  assert.ok(expression);
  const select=new Function('computed','columns','selectedColumns',`return (${expression});`);
  const app=createSSRApp({setup(){
    const columns=computed(()=>[{key:'invoiceNumber'},{key:'grandTotal'}]);
    const selectedColumns=ref(columns.value.map(column=>({...column})));
    const visible=select(computed,columns,selectedColumns);
    return()=>h('p',visible.value.map((column:any)=>column.key).join(','));
  }});
  assert.equal(await renderToString(app),'<p>invoiceNumber,grandTotal</p>','Recreated columns must retain the same visible selection');
});
