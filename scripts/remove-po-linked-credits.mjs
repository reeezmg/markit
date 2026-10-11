import dotenv from 'dotenv';
import pg from 'pg';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
dotenv.config({quiet:true});
const apply=process.argv.includes('--apply');
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(!out)throw Error('Explicit --out directory required. Default previews and rolls back; --apply commits.');
mkdirSync(out,{recursive:true});copyFileSync(new URL(import.meta.url),resolve(out,'cleanup-script.mjs'));
function load(file,tail){const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import .*;?\r?\n/gm,'').replace(/export /g,'');return new Function('randomUUID',code+tail)(randomUUID);}
const ensure=load('server/utils/purchase-order-source.ts','\nreturn ensurePurchaseOrderSource;');
const update=load('server/utils/purchase-accounting-update.ts','\nreturn updatePurchaseAccounting;');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
const report={applied:false,startedAt:new Date().toISOString(),scope:'Every company; only credits linked to a PO',backup:null};
try{
 await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='20s'");await client.query("SET LOCAL statement_timeout='90s'");
 const ids=(await client.query('SELECT DISTINCT company_id FROM distributor_credits WHERE purchase_order_id IS NOT NULL ORDER BY company_id')).rows.map(r=>r.company_id);
 if(!ids.length){await client.query('ROLLBACK');report.noOp=true;writeFileSync(resolve(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));process.exit(0);}
 await client.query('SELECT id FROM companies WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[ids]);
 for(const id of ids)await client.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[id]);
 await client.query('LOCK TABLE purchase_orders,distributor_credits,distributor_payments,distributor_payment_allocations,products,variants,items,expenses,money_transactions,purchase_returns,purchase_return_items,distributor_companies,accountant_v2_manual_journals,accountant_v2_manual_journal_lines IN SHARE ROW EXCLUSIVE MODE');
 const query=async(sql,args=[])=> (await client.query(sql,args)).rows;
 const credits=await query('SELECT * FROM distributor_credits ORDER BY company_id,id');
 const targets=credits.filter(c=>c.purchase_order_id!==null);const pids=[...new Set(targets.map(c=>c.purchase_order_id))];
 assert.ok(targets.every(c=>ids.includes(c.company_id)),'Target companies changed during lock acquisition; retry');
 assert.ok(targets.every(c=>c.money_transaction_id===null),'A PO credit has a linked receipt: review before deletion');
 const po=await query('SELECT * FROM purchase_orders WHERE id=ANY($1::text[]) ORDER BY id',[pids]);
 assert.equal(po.length,pids.length,'All target purchase orders must exist');
 const eventsBefore=await query('SELECT * FROM accountant_v2_distributor_events WHERE company_id=ANY($1::text[]) ORDER BY company_id,distributor_id,source_key',[ids]);
 const sourcesBefore=await query('SELECT * FROM accountant_v2_distributor_sources WHERE company_id=ANY($1::text[]) ORDER BY company_id,distributor_id,source_key',[ids]);
 const journalsBefore=await query('SELECT * FROM accountant_v2_manual_journals WHERE company_id=ANY($1::text[]) ORDER BY id',[ids]);
 const linesBefore=await query('SELECT * FROM accountant_v2_manual_journal_lines WHERE company_id=ANY($1::text[]) ORDER BY id',[ids]);
 const balances=()=>query(`SELECT l.company_id,l.account_id,l.distributor_id,l.party_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount*j.exchange_rate ELSE -l.amount*j.exchange_rate END)::text amount
  FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id WHERE j.company_id=ANY($1::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY l.company_id,l.account_id,l.distributor_id,l.party_id ORDER BY l.company_id,l.account_id,l.distributor_id,l.party_id`,[ids]);
 const beforeBalances=await balances();
 const tables=['companies','distributor_payments','distributor_payment_allocations','distributor_companies','products','variants','items','expenses','money_transactions','purchase_returns','account_ledger_entries'];
 const hashes=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await query(`SELECT count(*)::int rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM ${table} t`))[0]])));
 const beforeHashes=await hashes();
 const supplierCopies=[];
 for(const p of po){const e=eventsBefore.filter(e=>e.company_id===p.company_id&&e.source_key==='purchase:'+p.id);assert.equal(e.length,1,'A target PO must have exactly one existing purchase source: '+p.id);assert.equal(Number(e[0].amount),Math.round(p.total_amount*100)/100,'PO and source already differ: '+p.id);if(!p.distributor_id)supplierCopies.push({companyId:p.company_id,poId:p.id,poNo:p.purchase_order_no,distributorId:e[0].distributor_id});}
 const backup={capturedAt:new Date().toISOString(),ids,targets,standalone:credits.filter(c=>c.purchase_order_id===null),purchaseOrders:po,events:eventsBefore,sources:sourcesBefore,journals:journalsBefore,lines:linesBefore,balances:beforeBalances,hashes:beforeHashes,supplierCopies};
 const backupPath=resolve(out,'backup.json');writeFileSync(backupPath,JSON.stringify(backup,null,2),{flag:'wx'});
 report.backup={path:backupPath,sha256:createHash('sha256').update(readFileSync(backupPath)).digest('hex')};report.linkedCredits=targets.length;report.standaloneCredits=backup.standalone.length;report.purchaseOrders=po.length;report.supplierCopies=supplierCopies;
 console.log(JSON.stringify({backup:report.backup.path,linkedCredits:targets.length,purchaseOrders:po.length,standaloneCredits:backup.standalone.length,supplierCopies:supplierCopies.length}));
 await client.query("SELECT set_config('app.accountant_user','po-credit-cleanup',true)");
 for(const s of supplierCopies)await client.query('UPDATE purchase_orders SET distributor_id=$3,updated_at=now() WHERE company_id=$1 AND id=$2 AND distributor_id IS NULL',[s.companyId,s.poId,s.distributorId]);
 let updated=0;
 let processed=0;
 for(const p of po){await ensure(client,p.company_id,p.id);if(await update(client,p.company_id,p.id))updated++;
  if(++processed%12===0)console.log(JSON.stringify({phase:'preserve-purchase-source',processed,total:po.length}));}
 const deleted=await query('DELETE FROM distributor_credits WHERE id=ANY($1::text[]) AND purchase_order_id IS NOT NULL RETURNING id',[targets.map(c=>c.id)]);
 assert.equal(deleted.length,targets.length);
 await client.query('SET CONSTRAINTS ALL IMMEDIATE');await client.query('SET CONSTRAINTS ALL DEFERRED');
 const repeated=await query('SELECT company_id,distributor_id,accountant_v2_sync_distributor(company_id,distributor_id) changed FROM accountant_v2_distributor_settings WHERE company_id=ANY($1::text[]) AND enabled ORDER BY company_id,distributor_id',[ids]);
 assert.equal(repeated.reduce((s,r)=>s+Number(r.changed),0),0,'Cleanup must be fully synchronized');
 const eventsAfter=await query('SELECT * FROM accountant_v2_distributor_events WHERE company_id=ANY($1::text[]) ORDER BY company_id,distributor_id,source_key',[ids]);
 assert.deepEqual(eventsAfter.map(e=>[e.company_id,e.distributor_id,e.source_key,e.kind,String(e.amount),String(e.tax),e.mode,e.bank_id]),eventsBefore.map(e=>[e.company_id,e.distributor_id,e.source_key,e.kind,String(e.amount),String(e.tax),e.mode,e.bank_id]),'All source amounts, suppliers and event identities must remain unchanged');
 const remaining=await query('SELECT * FROM distributor_credits ORDER BY company_id,id');assert.deepEqual(remaining,backup.standalone,'All standalone DCs must remain byte-for-byte unchanged');
 const finalPO=await query('SELECT * FROM purchase_orders WHERE id=ANY($1::text[]) ORDER BY id',[pids]);
 assert.deepEqual(finalPO.map(p=>{const copy={...p};const changed=supplierCopies.find(s=>s.poId===p.id);if(changed){copy.distributor_id=null;copy.updated_at=po.find(x=>x.id===p.id).updated_at;}return copy;}),po,'Only four carried-forward supplier fields may change on POs');
 assert.deepEqual(await hashes(),beforeHashes,'Payments, allocations, standalone money, stock rows, opening dues and archived ledger must remain unchanged');
 assert.deepEqual(await balances(),beforeBalances,'All accounts, suppliers and contacts must keep identical balances');
 const sourcesAfter=await query('SELECT * FROM accountant_v2_distributor_sources WHERE company_id=ANY($1::text[]) ORDER BY company_id,distributor_id,source_key',[ids]);
 assert.deepEqual(sourcesAfter.map(s=>[s.company_id,s.distributor_id,s.source_key,s.journal_id,s.accounts]),sourcesBefore.map(s=>[s.company_id,s.distributor_id,s.source_key,s.journal_id,s.accounts]),'No source journal ID or chosen account may change');
 const currentJournals=new Set(sourcesBefore.filter(s=>pids.includes(s.source_key.replace(/^purchase:/,''))).map(s=>s.journal_id));
 const journalsAfter=await query('SELECT * FROM accountant_v2_manual_journals WHERE company_id=ANY($1::text[]) ORDER BY id',[ids]);
 assert.deepEqual(journalsAfter.filter(j=>!currentJournals.has(j.id)),journalsBefore.filter(j=>!currentJournals.has(j.id)),'Unrelated journals must remain unchanged');
 report.verification={remainingLinkedCredits:remaining.filter(c=>c.purchase_order_id!==null).length,standaloneUnchanged:true,paymentAndStockSourcesUnchanged:true,allAccountBalancesUnchanged:true,currentJournalIdsUnchanged:true,eventAmountsAndSuppliersUnchanged:true,repeatChanges:0,updatedInPlace:updated};
 if(apply){await client.query('COMMIT');report.applied=true;}else await client.query('ROLLBACK');
 report.finishedAt=new Date().toISOString();writeFileSync(resolve(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await client.query('ROLLBACK');report.error=e.message;writeFileSync(resolve(out,'verification.json'),JSON.stringify(report,null,2));throw e;}
finally{await client.end();}
