import {createHash} from 'node:crypto';
import {cents} from './legacy-cash-bank-plan.mjs';
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const id=v=>'c'+hash(v).slice(0,24);

// Reset-only batch path. Caller deletes native/replacement records and owns rollback.
// Uses the same identifiers, fingerprints and audit contract as importTransfers.
export async function copyTransfersBatch(db,c,{through,mappings={}}) {
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const rows=await q(`SELECT id,company_id,from_type::text,to_type::text,from_account_id,to_account_id,amount::text,note,created_at::text AS date FROM account_transfers WHERE company_id=$1 AND created_at<($2::date+interval '1 day') ORDER BY created_at,id`,[c,through]);
 const setup=(await q('SELECT accounts FROM accountant_v2_erp_settings WHERE company_id=$1 AND enabled',[c]))[0];
 const currency=(await q('SELECT currency FROM companies WHERE id=$1',[c]))[0]?.currency||'INR';
 if(!setup)throw Error('Connect ERP accounting first');
 if((await q('SELECT id FROM accountant_v2_account_transfers WHERE company_id=$1 LIMIT 1',[c])).length)throw Error('Batch copy requires an empty transfer target');
 const accounts=new Map((await q('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1',[c])).map(a=>[a.id,a]));
 const banks=new Set((await q('SELECT id FROM bank_accounts WHERE company_id=$1',[c])).map(b=>b.id));
 const bankMappings=await q('SELECT role,account_id FROM accountant_v2_distributor_mappings WHERE company_id=$1',[c]);
 const old=await q(`SELECT *,journal_date::text AS source_date FROM accountant_v2_manual_journals WHERE company_id=$1 AND source_type='LEGACY_CASH_BANK_HISTORY' AND reference_number LIKE 'ACCOUNT_TRANSFER:%' AND deleted_at IS NULL`,[c]);
 const oldLines=await q(`SELECT l.* FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id WHERE l.company_id=$1 AND j.source_type='LEGACY_CASH_BANK_HISTORY' AND j.reference_number LIKE 'ACCOUNT_TRANSFER:%' AND j.deleted_at IS NULL AND l.deleted_at IS NULL`,[c]);
 const provenance=await q(`SELECT "resourceId","after" FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='legacy-cash-bank-import' AND action='imported'`,[c]);
 const reversed=new Set((await q('SELECT reversed_from_id FROM accountant_v2_manual_journals WHERE company_id=$1 AND reversed_from_id IS NOT NULL AND deleted_at IS NULL',[c])).map(j=>j.reversed_from_id));
 const transfers=[],journals=[],lines=[],audits=[];
 const expected=new Map();
 const balances=async()=>new Map((await q(`SELECT l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END)::text amount FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id WHERE j.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY l.account_id`,[c])).map(r=>[r.account_id,cents(r.amount)]));
 const before=await balances();
 function post(jid,type,source,row,entries,parent=null){
  journals.push({id:jid,date:row.date,reference:'ACCOUNT_TRANSFER:'+row.id,notes:row.note||'Imported account transfer',amount:row.amount,type,source,parent});
  entries.forEach((line,i)=>{lines.push({id:id(jid+':'+i),journal:jid,account:line.account_id,side:line.side,amount:String(line.amount),description:row.note||'Historical transfer'});expected.set(line.account_id,(expected.get(line.account_id)||0n)+cents(line.amount)*(line.side==='DEBIT'?1n:-1n));});
 }
 for(const row of rows){
  if(cents(row.amount)<=0n)throw Error('Invalid transfer amount');
  const candidates=old.filter(j=>j.reference_number==='ACCOUNT_TRANSFER:'+row.id);
  if(candidates.length>1)throw Error('Duplicate old transfer journal');
  const parent=candidates[0], priorLines=parent?oldLines.filter(l=>l.journal_id===parent.id):[];
  if(parent&&(parent.status!=='PUBLISHED'||parent.currency!==currency||Number(parent.exchange_rate)!==1||parent.source_date!==row.date||reversed.has(parent.id)||!provenance.some(a=>a.resourceId===parent.id&&a.after.source==='ACCOUNT_TRANSFER:'+row.id)))throw Error('Old transfer journal does not verify source: '+row.id);
  const resolve=(type,bankId,side)=>{
   let target;
   if(type==='CASH')target=mappings.cash||setup.accounts.cash;
   else if(type==='BANK'&&!bankId)target=mappings.bank||setup.accounts.bank;
   else if(type==='BANK'){
    if(!banks.has(bankId))throw Error('Bank belongs to another company');
    const matched=[...new Set(bankMappings.filter(m=>m.role==='bank:'+bankId).map(m=>m.account_id))];
    target=mappings.banks?.[bankId]||(matched.length===1?matched[0]:null);
   }else if(type==='INVESTMENT'){
    const matches=priorLines.filter(l=>l.side===side&&accounts.get(l.account_id)?.code==='LCB-CLEARING');
    target=mappings.investment||(matches.length===1?matches[0].account_id:null);
   }
   const a=accounts.get(target),types=type==='CASH'?['CASH']:type==='BANK'?['BANK']:['EQUITY','OTHER_LIABILITY','OTHER_CURRENT_ASSET','OTHER_ASSET'];
   if(!a||!a.is_active||a.deleted_at||!types.includes(a.account_type))throw Error('Provide valid account mapping for '+row.id);
   return target;
  };
  const from=resolve(row.from_type,row.from_account_id,'CREDIT'),to=resolve(row.to_type,row.to_account_id,'DEBIT');
  if(from===to)throw Error('Same transfer accounts');
  const desired=[{account_id:from,side:'CREDIT',amount:row.amount},{account_id:to,side:'DEBIT',amount:row.amount}];
  if(parent&&(priorLines.length!==2||priorLines.some(l=>cents(l.amount)!==cents(row.amount))||new Set(priorLines.map(l=>l.side)).size!==2||priorLines.some(l=>!desired.some(d=>d.account_id===l.account_id&&d.side===l.side)&&accounts.get(l.account_id)?.code!=='LCB-CLEARING')))throw Error('Old transfer posting mismatch');
  const transferId=id(c+':legacy-transfer:'+row.id),journalId=id(transferId+':journal'),reversalId=parent?id(transferId+':reversal'):null;
  transfers.push({id:transferId,number:'TRF-'+String(transfers.length+1).padStart(5,'0'),date:row.date,from,to,amount:row.amount,reference:row.id,note:row.note});
  if(parent)post(reversalId,'TRANSFER_HISTORY_MIGRATION_REVERSAL',parent.id,row,priorLines.map(l=>({...l,side:l.side==='DEBIT'?'CREDIT':'DEBIT'})),parent.id);
  post(journalId,'ACCOUNT_TRANSFER',transferId,row,desired);
  audits.push({id:id(transferId+':audit'),sourceId:row.id,after:{fingerprint:hash(row),transferId,journalId,reversalId,source:'ACCOUNT_TRANSFER:'+row.id,sourceRow:row}});
 }
 const serialize=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
 // Date locks are enforced for every source before the batched writes.
 await db.query(`SELECT accountant_v2_distributor_check_date($1,t.created_at,true) FROM account_transfers t WHERE t.company_id=$1 AND t.created_at<($2::date+interval '1 day')`,[c,through]);
 await db.query(`INSERT INTO accountant_v2_account_transfers(id,company_id,transfer_number,transfer_date,from_account_id,to_account_id,amount,currency,exchange_rate,reference_number,description,updated_at) SELECT x->>'id',$1,x->>'number',(x->>'date')::timestamp,x->>'from',x->>'to',(x->>'amount')::numeric,$3,1,x->>'reference',x->>'note',now() FROM jsonb_array_elements($2::jsonb) x`,[c,serialize(transfers),currency]);
 await db.query(`INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,reversed_from_id,updated_at) SELECT x->>'id',$1,'TRH-'||(x->>'id'),(x->>'date')::timestamp,x->>'reference',x->>'notes',$3,(x->>'amount')::numeric,'PUBLISHED',now(),true,x->>'type',x->>'source',x->>'parent',now() FROM jsonb_array_elements($2::jsonb) x`,[c,serialize(journals),currency]);
 await db.query(`INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,updated_at) SELECT x->>'id',$1,x->>'journal',x->>'account',(x->>'side')::"AccountantJournalEntrySide",(x->>'amount')::numeric,x->>'description',now() FROM jsonb_array_elements($2::jsonb) x`,[c,serialize(lines)]);
 await db.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at) SELECT x->>'id',$1,'transfer-history-import','imported','transfer-history-import',x->>'sourceId',x->'after',now() FROM jsonb_array_elements($2::jsonb) x`,[c,serialize(audits)]);
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
 const after=await balances();
 for(const account of new Set([...before.keys(),...after.keys()]))if((after.get(account)||0n)-(before.get(account)||0n)!==(expected.get(account)||0n))throw Error('Unexpected transfer balance movement');
 const mismatch=await q(`SELECT n.id FROM accountant_v2_account_transfers n JOIN accountant_v2_manual_journals j ON j.company_id=n.company_id AND j.source_type='ACCOUNT_TRANSFER' AND j.source_id=n.id WHERE n.company_id=$1 AND (j.total<>n.amount OR j.journal_date<>n.transfer_date OR (SELECT sum(l.amount) FROM accountant_v2_manual_journal_lines l WHERE l.journal_id=j.id AND l.account_id=n.from_account_id AND l.side='CREDIT') IS DISTINCT FROM n.amount OR (SELECT sum(l.amount) FROM accountant_v2_manual_journal_lines l WHERE l.journal_id=j.id AND l.account_id=n.to_account_id AND l.side='DEBIT') IS DISTINCT FROM n.amount)`,[c]);
 if(mismatch.length)throw Error('Copied transfer journals do not match records');
 return {created:rows.length,replacedJournals:old.length,verified:true};
}
