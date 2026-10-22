import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {ref} from 'vue';
function media(initial:any[]=[]){
  const source=readFileSync(process.env.PRODUCT_MEDIA_SOURCE||'components/AddProduct/Media.vue','utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast=ts.createSourceFile('media.ts',source,ts.ScriptTarget.Latest,true);
  const call=ast.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='watch') as ts.ExpressionStatement;
  const callback=(call.expression as ts.CallExpression).arguments[1].getText(ast);
  const selectedFiles=ref(initial),imagePreviewUrls=ref(initial.map(()=>''));
  const js=ts.transpileModule('const callback = '+callback+';',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const apply=new Function('selectedFiles','imagePreviewUrls','URL',js+';return callback;')(selectedFiles,imagePreviewUrls,{createObjectURL:()=> 'blob:fixture'});
  return{apply,selectedFiles,imagePreviewUrls};
}
for(const initial of [[],[{uuid:'fixture',view:'front'}]])test(`empty image props settle after a parent echo (${initial.length?'clearing':'initial'})`,()=>{
  const current=media(initial);let incoming:any[]=[];let updates=0;
  for(;updates<10;updates++){
    const previous=current.selectedFiles.value;current.apply(incoming);
    if(current.selectedFiles.value===previous)break;
    // The product form copies emitted files back into variant.images.
    incoming=[...current.selectedFiles.value];
  }
  assert.ok(updates<=1,'An empty image update must not loop through parent/child watchers');
  assert.deepEqual(current.selectedFiles.value,[]);assert.deepEqual(current.imagePreviewUrls.value,[]);
});
test('existing image echoes preserve pending files and chosen image views',()=>{
  const file={fixture:true},current=media([{uuid:'fixture',file,view:'back'}]);const before=current.selectedFiles.value;
  current.apply(['fixture']);assert.equal(current.selectedFiles.value,before);assert.equal(current.selectedFiles.value[0].view,'back');
});

test('product edit ignores an identical empty media emission but accepts a new file',()=>{
  const source=readFileSync(process.env.PRODUCT_EDIT_SOURCE||'pages/products/edit/[id].vue','utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast=ts.createSourceFile('product.ts',source,ts.ScriptTarget.Latest,true);
  const statement=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='fileValue'))!;
  const js=ts.transpileModule(statement.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const variants=ref<any[]>([{images:[]}]);const update=new Function('variants','console',js+';return fileValue;')(variants,{log(){}});
  const before=variants.value[0].images;update({index:0,files:[]});assert.equal(variants.value[0].images,before);
  update({index:0,files:[{uuid:'fixture',view:'front'}]});assert.equal(variants.value[0].images[0].uuid,'fixture');
});
