import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {computed,ref,createSSRApp,h} from 'vue';
import {renderToString} from '@vue/server-renderer';

test('printer hardware capability has the same initial server and browser markup',async()=>{
  const source=readFileSync('pages/settings/printer.vue','utf8');
  const initializer=source.match(/const webUsbSupported = (.+);/)?.[1];
  assert.ok(initializer);
  const render=async(supported:boolean)=>renderToString(createSSRApp({setup(){
    const value=new Function('ref','computed','isWebUsbSupported','return '+initializer)(ref,computed,()=>supported);
    return()=>h('div',value.value?'Connect USB printer':'USB unavailable');
  }}));
  assert.equal(await render(true),await render(false));
  assert.match(source,/onMounted\(async \(\) => \{\s*webUsbSupported\.value = isWebUsbSupported\(\)/);
});
