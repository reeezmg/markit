import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {ref,watch,nextTick} from 'vue';

test('sales history handles missing account and categories arriving after a snapshot',async()=>{
  const source=readFileSync('pages/saleshistory/[billId].vue','utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast=ts.createSourceFile('history.ts',source,ts.ScriptTarget.Latest,true);
  const statement=ast.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&
    node.expression.expression.getText(ast)==='watch'&&node.expression.arguments[0].getText(ast).includes('bill'));
  assert.ok(statement);
  const bill=ref<any>(null),categories=ref<any>(undefined);
  const bindings:any={watch,bill,categories};
  for(const name of ['discount','selected','clientId','clientName','phoneNo','paymentMethod','date','grandTotal','subtotal','returnAmt','voucherNo','items'])bindings[name]=ref();
  const js=ts.transpileModule(statement.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  new Function(...Object.keys(bindings),js)(...Object.values(bindings));
  bill.value={changedAt:'2026-10-21T00:00:00Z',data:{account:null,return_Amt:12,payment_method:'Cash',entries:[{category_id:'category',name:'Fixture'}]}};
  await nextTick();
  assert.equal(bindings.selected.value,'');assert.equal(bindings.returnAmt.value,12);
  assert.deepEqual(bindings.items.value[0].category,[]);
  categories.value=[{id:'category',name:'Fixture category'}];await nextTick();
  assert.equal(bindings.items.value[0].category[0].id,'category');
});
