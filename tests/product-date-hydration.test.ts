import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
test('product dates use the same business locale and timezone during server/client rendering',()=>{
 const source=readFileSync(process.env.PRODUCT_DATE_SOURCE||'pages/products/index.vue','utf8');
 const expression=source.match(/\{\{\s*(new Date\(row\.createdAt\)\.toLocaleString\([\s\S]*?\))\s*\}\}/)![1];
 const format=(value:string,locale:string,zone:string)=>{
  class AmbientDate extends Date{
   toLocaleString(locales?:Intl.LocalesArgument,options?:Intl.DateTimeFormatOptions){return super.toLocaleString(locales??locale,{timeZone:zone,...options});}
  }
  return new Function('Date','row','return ('+expression+');')(AmbientDate,{createdAt:value});
 };
 for(const stamp of ['2026-01-01T21:00:00.000Z','2026-09-30T20:15:00.000Z','2026-10-21T01:00:00.000Z']){
  const server=format(stamp,'en-US','UTC'),browser=format(stamp,'en-GB','Asia/Kolkata');
  assert.equal(server,browser,'Ambient locale/timezone must not change a hydrated table cell');
  assert.equal(server,new Date(stamp).toLocaleString('en-IN',{year:'numeric',month:'short',day:'numeric',timeZone:'Asia/Kolkata'}));
 }
});
