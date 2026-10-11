import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync('server/utils/purchase-accounting-update.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal(code.diagnostics?.length||0,0);
const update=new Function('randomUUID',code.outputText.replace(/^import .*;\r?\n/gm,'').replace(/export /g,'')+'\nreturn updatePurchaseAccounting;')(randomUUID);
const signature=(amount=100,tax=0)=>({source_key:'purchase:po',kind:'PURCHASE',event_date:'2026-02-08T00:00:00',amount,tax,mode:null,bank_id:null,description:'Purchase credit',reference:'PO-260'});
const fixture=()=>({signature:signature(),source:{company_id:'company',distributor_id:'vendor',source_key:'purchase:po',signature:signature(),journal_id:'journal',revision:1,accounts:{payable:'ap',stock:'stock',tax:'tax'}},journal:{id:'journal',company_id:'company',journal_date:'2026-02-08T00:00:00',source_type:'DISTRIBUTOR',status:'PUBLISHED',total:100},lines:[{id:'old-ap',journal_id:'journal',account_id:'ap',side:'CREDIT',amount:100},{id:'old-stock',journal_id:'journal',account_id:'stock',side:'DEBIT',amount:100}],audit:[]});
let state,lockedDate,inactive=false,failAudit=false,calls=[];const sqlSamples=new Map();
const canonical=v=>JSON.stringify(v,Object.keys(v||{}).sort());
const db={async query(sql,args=[]){calls.push({sql,args});if(!sqlSamples.has(sql))sqlSamples.set(sql,args);const res=rows=>({rows:structuredClone(rows),rowCount:rows.length});
 if(sql.includes('pg_advisory_xact_lock'))return res([]);
 if(sql.startsWith('SELECT e.*'))return res(args[0]!=='company'||state.unconnected?[]:[{...state.signature,distributor_id:'vendor',signature:{distributor_id:'vendor',...state.signature},contact_id:'contact'}]);
 if(sql.startsWith('SELECT *,signature='))return res(state.source?[{...state.source,unchanged:canonical(state.source.signature)===canonical(JSON.parse(args[3]))}]:[]);
 if(sql.startsWith('SELECT * FROM accountant_v2_manual_journals'))return res(state.journal?[state.journal]:[]);
 if(sql.includes('accountant_v2_distributor_check_date')){if(args[1]===lockedDate)throw Error('locked');return res([]);}
 if(sql.startsWith('SELECT 1 FROM accountant_v2_accounting_accounts'))return res(inactive?[]:[{}]);
 if(sql.startsWith('SELECT * FROM accountant_v2_manual_journal_lines'))return res(state.lines);
 if(sql.startsWith('UPDATE accountant_v2_manual_journals')){Object.assign(state.journal,{journal_date:args[2],reference_number:args[3],notes:args[4],total:args[5],source_id:args[6]});return res([]);}
 if(sql.startsWith('DELETE FROM accountant_v2_manual_journal_lines')){state.lines=[];return res([]);}
 if(sql.startsWith('INSERT INTO accountant_v2_manual_journal_lines')){state.lines.push({id:args[0],journal_id:args[2],account_id:args[3],side:args[4],amount:args[5],description:args[6],party_id:args[7],distributor_id:args[8]});return res([]);}
 if(sql.startsWith('UPDATE accountant_v2_distributor_sources')){state.source.signature=JSON.parse(args[3]);state.source.revision=args[4];return res([]);}
 if(sql.startsWith('INSERT INTO accountant_v2_accountant_audit')){if(failAudit)throw Error('audit failed');state.audit.push(JSON.parse(args[3]));return res([]);}
 throw Error('Unexpected SQL '+sql);
}};
async function transaction(){const before=structuredClone(state);try{return await update(db,'company','po');}catch(e){state=before;throw e;}}
state=fixture();state.signature=signature(150,30);assert.equal(await transaction(),true);
assert.equal(state.journal.id,'journal');assert.equal(state.journal.total,150);assert.deepEqual(state.lines.map(l=>[l.account_id,l.side,l.amount]),[['ap','CREDIT',150],['stock','DEBIT',120],['tax','DEBIT',30]]);
assert.equal(state.audit[0].previous.journal.total,100);assert.equal(state.audit[0].previous.lines.length,2);assert.deepEqual(state.source.signature,state.signature,'native trigger must see the exact event signature');assert.equal(state.source.journal_id,'journal');
assert.ok(!calls.some(c=>c.sql.startsWith('INSERT INTO accountant_v2_manual_journals')),'edit keeps one journal');
calls=[];assert.equal(await transaction(),true);assert.equal(state.audit.length,1,'repeat save does not repost or add audit revisions');assert.ok(!calls.some(c=>/^(UPDATE|DELETE|INSERT)/.test(c.sql)));
state.signature=signature(200,200);await transaction();assert.equal(state.journal.id,'journal');assert.deepEqual(state.lines.map(l=>[l.account_id,l.amount]),[['ap',200],['tax',200]]);
state.signature=signature(0,0);await transaction();assert.equal(state.lines.length,0);assert.equal(state.journal.total,0);
state=fixture();state.signature=signature(125,0);state.source.accounts.stock='new-stock';state.source.signature.accountSelectionChanged=true;await transaction();assert.equal(state.lines[1].account_id,'new-stock');
for(const lock of ['2026-02-08T00:00:00','2026-03-01T00:00:00']){state=fixture();state.signature={...signature(150),event_date:'2026-03-01T00:00:00'};lockedDate=lock;const before=structuredClone(state);await assert.rejects(transaction(),/locked/);assert.deepEqual(state,before);}lockedDate=undefined;
state=fixture();state.signature=signature(150);inactive=true;await assert.rejects(transaction(),/active company/);assert.equal(state.journal.total,100);inactive=false;
state=fixture();state.signature=signature(150);failAudit=true;const before=structuredClone(state);await assert.rejects(transaction(),/audit failed/);assert.deepEqual(state,before,'audit failure rolls back accounting and source revision');failAudit=false;
state=fixture();state.source=null;assert.equal(await transaction(),false,'first posting stays with native trigger');
state=fixture();calls=[];assert.equal(await update(db,'foreign-company','po'),false);assert.ok(!calls.some(c=>/^(UPDATE|DELETE|INSERT)/.test(c.sql)),'foreign company cannot edit the journal');
state=fixture();state.signature=signature(-1);await assert.rejects(transaction(),/Invalid purchase/);
if(process.argv.includes('--check-sql')){
 await import('dotenv/config');const {default:pg}=await import('pg');const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{await client.query('BEGIN READ ONLY');for(const [sql,args] of sqlSamples)await client.query('EXPLAIN '+sql,args);await client.query('ROLLBACK');console.log('SQL planned against existing tables in a read-only transaction; no data/schema changes.');}finally{await client.end();}
}
console.log('Purchase edits passed: same journal ID, source amount/GST, zero total, account override, repeat save, date locks, company scope and rollback.');
