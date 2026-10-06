import {createHash} from 'node:crypto';
import {cents,money} from './legacy-cash-bank-plan.mjs';
const id = text => 'c'+createHash('sha256').update(text).digest('hex').slice(0,24);
const fingerprint = row => createHash('sha256').update(JSON.stringify(row)).digest('hex');

// Caller owns the transaction. Preview runs exactly the same checks and rolls back.
export async function importTransactions(db, companyId, {through, mappings={}, clearing=false}={}) {
 await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[companyId]);
 await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[companyId]);
 const company=(await db.query('SELECT id,currency FROM companies WHERE id=$1',[companyId])).rows[0];
 if(!company) throw Error('Company not found');
 const settings=(await db.query('SELECT accounts FROM accountant_v2_erp_settings WHERE company_id=$1 AND enabled',[companyId])).rows[0];
 if(!settings) throw Error('Connect ERP accounting first');
 const result={companyId,created:0,reused:0,unchanged:0,linked:0,pending:0,rows:[],balanceChanges:[]};
 const balances=async()=>Object.fromEntries((await db.query(`SELECT l.account_id,round(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END*j.exchange_rate),2)::text AS amount
 FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 WHERE j.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY l.account_id`,[companyId])).rows.map(r=>[r.account_id,r.amount]));
 const before=await balances(), expected={};
 const rows=(await db.query(`SELECT id,company_id,party_type::text,direction::text,status::text,amount::text,payment_mode::text,account_id,note,created_at::text AS date
 FROM money_transactions WHERE company_id=$1 AND created_at < ($2::date+interval '1 day') ORDER BY created_at,id FOR UPDATE`,[companyId,through])).rows;
 for(const row of rows){
  const fp=fingerprint(row), key='MONEY_TRANSACTION:'+row.id;
  const prior=(await db.query(`SELECT "after" FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='transaction-history-import' AND "resourceId"=$2 AND action='imported'`,[companyId,row.id])).rows;
  if(prior.length>1) throw Error('Duplicate import metadata: '+row.id);
  if(prior.length && prior[0].after.fingerprint!==fp) throw Error('Previously imported source changed: '+row.id);
  const linked=(await db.query(`SELECT 'salary' AS kind FROM salary_payments WHERE company_id=$1 AND money_transaction_id=$2
   UNION ALL SELECT 'distributor' FROM distributor_credits WHERE company_id=$1 AND money_transaction_id=$2
   UNION ALL SELECT 'staff-credit' FROM user_ledger_entries WHERE company_id=$1 AND id=$2 AND source_type='MANUAL'`,[companyId,row.id])).rows;
  if(linked.length){result.linked++;result.rows.push({id:row.id,status:'owned-by-source',source:linked.map(x=>x.kind)});continue;}
  if(row.status!=='PAID'){result.pending++;result.rows.push({id:row.id,status:'pending-no-posting'});continue;}
  const amount=cents(row.amount);if(amount<=0n || !['RECEIVED','GIVEN'].includes(row.direction))throw Error('Invalid transaction: '+row.id);
  if(!['CASH','BANK','UPI','CARD','CHEQUE'].includes(row.payment_mode))throw Error('Unsupported payment mode: '+row.id);
  let moneyId=row.payment_mode==='CASH'?settings.accounts.cash:settings.accounts.bank;
  if(row.account_id){
   const banks=(await db.query('SELECT id FROM bank_accounts WHERE company_id=$1 AND id=$2',[companyId,row.account_id])).rows;
   if(!banks.length)throw Error('Bank belongs to another company: '+row.id);
   const matches=(await db.query(`SELECT DISTINCT account_id FROM accountant_v2_distributor_mappings WHERE company_id=$1 AND role=$2`,[companyId,'bank:'+row.account_id])).rows;
   moneyId=mappings.banks?.[row.account_id] || (matches.length===1?matches[0].account_id:null);
   if(!moneyId)throw Error('Provide bank mapping for '+row.account_id);
  }
  if(mappings.money?.[row.payment_mode])moneyId=mappings.money[row.payment_mode];
  const candidates=(await db.query(`SELECT j.*,j.journal_date::text AS source_date FROM accountant_v2_manual_journals j WHERE j.company_id=$1 AND j.deleted_at IS NULL AND
   ((j.source_type='LEGACY_CASH_BANK_HISTORY' AND j.reference_number=$2) OR (j.source_type IN ('LEGACY_MONEY_RECEIVE','LEGACY_MONEY_PAY') AND j.source_id=$3))`,[companyId,key,row.id])).rows;
  if(candidates.length>1)throw Error('Multiple journals already represent '+row.id);
  let journal=candidates[0];
  if(prior.length && (!journal || journal.id!==prior[0].after.journalId))throw Error('Imported journal missing or replaced: '+row.id);
  const side=row.direction==='RECEIVED'?'DEBIT':'CREDIT';
  if(journal){
   if(journal.status!=='PUBLISHED' || journal.currency!==(company.currency||'INR') || Number(journal.exchange_rate)!==1 || new Date(journal.source_date+'Z').getTime()!==new Date(row.date+'Z').getTime())throw Error('Existing journal status/date/currency differs: '+row.id);
   const lines=(await db.query(`SELECT l.account_id,l.side::text,l.amount::text,a.account_type::text FROM accountant_v2_manual_journal_lines l
    JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id WHERE l.company_id=$1 AND l.journal_id=$2 AND l.deleted_at IS NULL`,[companyId,journal.id])).rows;
   const cash=lines.filter(l=>['CASH','BANK'].includes(l.account_type));
   if(cash.length!==1 || cash[0].account_id!==moneyId || cash[0].side!==side || cents(cash[0].amount)!==amount || lines.reduce((n,l)=>n+cents(l.amount)*(l.side==='DEBIT'?1n:-1n),0n)!==0n)throw Error('Existing posting differs from source: '+row.id);
   if(mappings.purposes?.[row.id] && !lines.some(l=>l.account_id===mappings.purposes[row.id] && l.account_id!==moneyId))throw Error('Existing purpose differs from requested mapping: '+row.id);
   if(journal.source_type==='LEGACY_CASH_BANK_HISTORY' && !(await db.query(`SELECT id FROM accountant_v2_accountant_audit WHERE company_id=$1 AND "resourceId"=$2 AND resource='legacy-cash-bank-import' AND action='imported' AND "after"->>'source'=$3`,[companyId,journal.id,key])).rowCount)throw Error('Existing journal has no import provenance: '+row.id);
   prior.length?result.unchanged++:result.reused++;
  } else {
   let purpose=mappings.purposes?.[row.id] || mappings.defaultPurpose;
   if(!purpose && clearing){
    purpose=id(companyId+'legacy-cash-bank-clearing');
    await db.query(`INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,code,account_type,category,currency,updated_at)
     VALUES($1,$2,'Legacy cash/bank migration clearing','LCB-CLEARING','EQUITY','EQUITY',$3,now()) ON CONFLICT(id) DO NOTHING`,[purpose,companyId,company.currency||'INR']);
   }
   if(!purpose)throw Error('Missing purpose account for '+row.id+'; supply mappings or --migration-clearing');
   const ac=(await db.query('SELECT id,account_type::text FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND id=ANY($2::text[]) AND is_active AND deleted_at IS NULL',[companyId,[moneyId,purpose]])).rows;
   if(ac.length!==2 || !ac.some(a=>a.id===moneyId&&['CASH','BANK'].includes(a.account_type)) || !ac.some(a=>a.id===purpose&&!['CASH','BANK','STOCK'].includes(a.account_type)))throw Error('Invalid money/purpose accounts: '+row.id);
   await db.query('SELECT accountant_v2_distributor_check_date($1,$2::timestamp,true)',[companyId,row.date]);
   const jid=id(companyId+key+':transaction-import');
   const type=row.direction==='RECEIVED'?'LEGACY_MONEY_RECEIVE':'LEGACY_MONEY_PAY';
   await db.query(`INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,updated_at)
    VALUES($1,$2,$3,$4::timestamp,$5,$6,$7,$8,'PUBLISHED',now(),true,$9,$10,now())`,[jid,companyId,'HIST-'+jid,row.date,key,row.note||'Imported money transaction',company.currency||'INR',row.amount,type,row.id]);
   for(const [account,entrySide] of [[moneyId,side],[purpose,side==='DEBIT'?'CREDIT':'DEBIT']]){
    await db.query(`INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,updated_at) VALUES($1,$2,$3,$4,$5::"AccountantJournalEntrySide",$6,$7,now())`,[id(jid+account),companyId,jid,account,entrySide,row.amount,row.party_type+': '+(row.note||'Historical transaction')]);
    expected[account]=(expected[account]||0n)+amount*(entrySide==='DEBIT'?1n:-1n);
   }
   journal={id:jid};result.created++;
  }
  if(!prior.length)await db.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
   VALUES($1,$2,'transaction-history-import','imported','transaction-history-import',$3,$4::jsonb,now())`,[id(companyId+key+':audit'),companyId,row.id,JSON.stringify({fingerprint:fp,journalId:journal.id,source:key,sourceRow:row})]);
  result.rows.push({id:row.id,journalId:journal.id,status:prior.length?'unchanged':candidates.length?'reused':'created'});
 }
 // Detect deleted sources instead of silently losing their imported money movement.
 const missing=await db.query(`SELECT a."resourceId" FROM accountant_v2_accountant_audit a WHERE a.company_id=$1 AND a.resource='transaction-history-import' AND a.action='imported' AND NOT EXISTS(SELECT 1 FROM money_transactions m WHERE m.company_id=a.company_id AND m.id=a."resourceId")`,[companyId]);
 if(missing.rowCount)throw Error('Previously imported source was deleted');
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
 const after=await balances();
 for(const account of new Set([...Object.keys(before),...Object.keys(after)])){
  const change=cents(after[account]||'0')-cents(before[account]||'0');
  if(change!==(expected[account]||0n))throw Error('Unexpected account balance movement: '+account);
  if(change)result.balanceChanges.push({accountId:account,amount:money(change)});
 }
 return result;
}
