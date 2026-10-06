import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse,compileScript } from '@vue/compiler-sfc';
import ts from 'typescript';
import * as Vue from 'vue';
import {renderToString} from '@vue/server-renderer';

const files=['components/Expense/TaxFields.vue','components/Expense/ExpenseQuickAdd.vue','components/Expense/ExpenseForm.vue','components/Accountant/ErpConnection.vue','pages/erp/billing.vue','pages/erp/sales.vue','pages/erp/expenses.vue','components/Distributor/AccountingTransactions.vue','components/Distributor/Accounting.vue','components/Distributor/AccountSelection.vue',
  'components/AddProduct/TopBar.vue','pages/distributor/index.vue','pages/distributor/add-purchase-return.vue',
  'pages/distributor/edit-purchase-return/[id].vue','pages/distributor/purchase-return.vue','pages/products/purchase.vue','pages/products/add.vue','pages/products/index.vue'];
const productList=readFileSync('pages/products/index.vue','utf8');
assert.ok(productList.includes("$fetch('/api/products/delete'"),'Product list deletes through the PO/accounting-aware endpoint');
assert.ok(!productList.includes('DeleteProduct.mutateAsync'),'Product list must not bypass purchase recalculation');
const errors:string[]=[];
Object.assign(globalThis,Vue,{
  useNuxtApp:()=>({$auth:{session:Vue.ref({role:'admin'})}}),useToast:()=>({add(){}}),
  $fetch:async()=>({enabled:true,mappings:{},sources:[],accounts:[],defaults:{}}),
});
mkdirSync('.cache/distributor-pages',{recursive:true});
for(const file of files) {
  const {descriptor,errors:parseErrors}=parse(readFileSync(file,'utf8'),{filename:file});
  assert.deepEqual(parseErrors,[],file);
  const script=compileScript(descriptor,{id:file,inlineTemplate:true});
  const output=ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
  assert.equal(output.diagnostics?.length||0,0,file);
  if(!file.startsWith('components/Distributor/') || file.endsWith('AccountingTransactions.vue'))continue;
  const dest=resolve('.cache/distributor-pages',file.split('/').pop()+'.mjs');writeFileSync(dest,output.outputText);
  const component=(await import(pathToFileURL(dest).href)).default;
  const app=Vue.createSSRApp(component,{companyId:'company',distributorId:'supplier',roles:['payable','stock']});
  app.config.warnHandler=()=>{};app.config.errorHandler=e=>errors.push(`${file}: ${e}`);
  await renderToString(app);
}
assert.deepEqual(errors,[]);
console.log('Distributor account selectors render; all changed purchase/distributor Vue templates compile.');
