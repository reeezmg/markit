import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readOnlyAuditJob} from './helpers/audit-job';
test('separate read-only jobs have fixed contained names and require a built server',()=>{
  assert.equal(readOnlyAuditJob(undefined,false,true),'');
  assert.equal(readOnlyAuditJob('head',false,true),'head');
  assert.equal(readOnlyAuditJob('branch',false,true),'branch');
  for(const value of ['../other','head,branch','all'])assert.throws(()=>readOnlyAuditJob(value,false,true));
  assert.throws(()=>readOnlyAuditJob('head',true,true));
  assert.throws(()=>readOnlyAuditJob('branch',false,false));
});
