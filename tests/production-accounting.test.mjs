import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {stages,migrations,validateConfig,targetIdentity,commandsFor} from '../scripts/production-accounting/plan.mjs';
const config={companies:['production-company'],through:'2026-09-29',output:'./run'};
assert.equal(validateConfig(config),config);
for(const bad of [{...config,companies:[]},{...config,companies:['x','x']},{...config,through:'2026-02-30'},{...config,output:''},{...config,skipCash:true}])assert.throws(()=>validateConfig(bad));
assert.equal(targetIdentity('postgres://user:secret@host/db?schema=a'),targetIdentity('postgres://user:newpassword@host/db?schema=a'));
assert.notEqual(targetIdentity('postgres://tenant1:secret@pool/db'),targetIdentity('postgres://tenant2:secret@pool/db'));
assert.notEqual(targetIdentity('postgres://user:secret@host/db?schema=a'),targetIdentity('postgres://user:secret@host/db?schema=b'));
assert.ok(stages.indexOf('cash-bank')<stages.indexOf('erp-history'));
assert.ok(stages.indexOf('erp-history')<stages.indexOf('stock'));
assert.equal(stages.at(-1),'verify');
for(const stage of stages){
 for(const [script,...args] of commandsFor(stage,config,false,'report.json',null)){
  assert.ok(existsSync(new URL('../scripts/production-accounting/'+script,import.meta.url)));
  if(stage!=='schema')assert.ok(!args.includes('--apply'));
 }
}
assert.deepEqual(commandsFor('cash-bank',config,true,'cash.json','review.json')[0],['import-legacy-cash-bank.mjs','--company=production-company','--apply','--report=cash.json','--through=2026-09-29','--migration-clearing','--review=review.json']);
assert.ok(!commandsFor('erp-history',config,true,'erp.json','review.json')[0].some(a=>a.includes('review')||a.includes('defer')));
for(const migration of migrations)assert.ok(existsSync(new URL('../prisma/migrations/'+migration+'/migration.sql',import.meta.url)));
const wrapper=readFileSync(new URL('../scripts/import-legacy-cash-bank.mjs',import.meta.url),'utf8');
assert.match(wrapper,/production-accounting\/import-legacy-cash-bank/);
console.log('Production accounting plan passed: explicit scope, date validation, secret-free target binding, ordered stages, previews and canonical dependencies.');
