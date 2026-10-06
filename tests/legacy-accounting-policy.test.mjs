import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
assert.equal(typeof require('../node_modules/.zenstack/enhance.js').enhance,'function','Generated enhancement and all validation modules load');
const loaded=require('../node_modules/.zenstack/policy.js');
const policy=loaded.default ?? loaded;
const models=['accountLedgerEntry','moneyTransaction','accountTransfer','investment','bankAccount','cashAccount'];
const db=new Proxy({}, {get(){throw Error('Policy guard must reject without querying');}});
let checks=0;
for(const model of models)for(const operation of ['create','update','delete']){
 const rule=policy.policy[model].modelLevel[operation];
 for(const user of [undefined,{id:'staff',role:'admin'}]){
  const result=await rule.guard({user},db);
  assert.ok(result === false || Array.isArray(result?.OR) && result.OR.length === 0,`${model}.${operation} rejects every row`);checks++;
 }
 if(operation==='create')assert.equal(rule.inputChecker({}, {user:{id:'staff'}}),false);
}
console.log(`PASS ${checks} generated policy denials plus 6 create-input denials. No database access.`);
