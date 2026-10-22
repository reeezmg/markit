import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {parse} from '@vue/compiler-sfc';
import {createModelRequestFetch} from '../utils/model-request-fetch';
function context(server:boolean){
  const source=parse(readFileSync(process.env.MODEL_CONTEXT_APP_SOURCE||'app.vue','utf8')).descriptor.scriptSetup!.content;
  const ast=ts.createSourceFile('app.ts',source,ts.ScriptTarget.Latest,true);
  const call=ast.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='provideHooksContext') as ts.ExpressionStatement;
  assert.ok(call);
  const expression=(call.expression as ts.CallExpression).arguments[0].getText(ast).replaceAll('import.meta.server',String(server));
  let request:any;
  const bindings={config:{public:{baseUrl:'https://configured-markit.example/api/model'}},
    useRequestURL:()=>new URL('http://127.0.0.1:3108/products'),useRequestHeaders:()=>({cookie:'session=fixture'}),
    createModelRequestFetch:(options:any)=>createModelRequestFetch({...options,fetcher:async(input:any,init:any)=>{request={url:new URL(String(input)),cookie:new Headers(init.headers).get('cookie')};return new Response('{"data":[]}');}}),
  };
  return{value:new Function(...Object.keys(bindings),'return ('+expression+');')(...Object.values(bindings)),request:()=>request};
}
test('model SSR context targets this request origin rather than a configured different host',async()=>{
  const current=context(true);await current.value.fetch(current.value.endpoint+'/brand/findMany');
  assert.equal(current.request().url.origin,'http://127.0.0.1:3108');
  assert.equal(current.request().url.pathname,'/api/model/brand/findMany');assert.equal(current.request().cookie,'session=fixture');
});
test('browser model context uses the same application API path',()=>{
  const current=context(false);assert.equal(current.value.endpoint,'/api/model');assert.equal(current.value.fetch,undefined);
});
