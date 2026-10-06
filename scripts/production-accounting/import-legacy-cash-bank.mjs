import dotenv from 'dotenv';
import {Pool} from 'pg';
import {writeFileSync,readFileSync} from 'node:fs';
import {applyReview} from './lib/legacy-cash-bank-review.mjs';
import {IMPORT_TYPE,planHistory,hash,cents,money} from './lib/legacy-cash-bank-plan.mjs';
dotenv.config({quiet:true});
const args=process.argv.slice(2), apply=args.includes('--apply');
const get=(key)=>args.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
if(args.includes('--help')){
 console.log('node scripts/import-legacy-cash-bank.mjs --company=<id> [repeat] | --all-connected [--through=YYYY-MM-DD] [--cash-account=<id> --bank-account=<id>] [--offset-account=<id>] [--apply] [--report=<path>]\nPreview is default. Apply requires an explicit offset account when missing movements need a counterpart. All selected companies commit together only when every projected balance matches.');process.exit(0);
}
const requested=args.filter(a=>a.startsWith('--company=')).map(a=>a.slice(10));
if(!requested.length&&!args.includes('--all-connected'))throw Error('Choose explicit --company=<id> arguments or --all-connected');
if(requested.length&&args.includes('--all-connected'))throw Error('Choose companies or --all-connected, not both');
const allowed=['company','through','cash-account','bank-account','offset-account','report','review'];
for(const arg of args)if(!['--apply','--all-connected','--migration-clearing'].includes(arg)&&!allowed.some(k=>arg.startsWith(`--${k}=`)))throw Error(`Unknown option ${arg}`);
const review=get('review')?JSON.parse(readFileSync(get('review'),'utf8')):null;
if(review && (review.version!==1 || !review.companies?.length))throw Error('Invalid reviewed snapshot');
if(args.includes('--migration-clearing') && get('offset-account'))throw Error('Choose migration clearing or an explicit offset');
const through=get('through');
if(through&&(!/^\d{4}-\d{2}-\d{2}$/.test(through)||!Number.isFinite(Date.parse(through))||new Date(through).toISOString().slice(0,10)!==through))throw Error('Invalid --through date');
const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';
if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw Error('Invalid database schema');
const pool=new Pool({connectionString:process.env.DATABASE_URL});const db=await pool.connect();
const report={version:1,applied:false,mode:'full-history',counterpartPolicy:'Explicit migration offset for missing cash/bank movements; this is not a complete income/expense history import.',companies:[]};
const reportPath=get('report')||`legacy-cash-bank-${apply?'import':'preview'}.json`;
const save=()=>writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
async function load(companyId,targets,offsetAccountId,cutoff){
 const rows=(await db.query(`SELECT account_type::text,source_type::text,source_id,direction::text,amount::text,entry_date::text AS date,note
   FROM account_ledger_entries WHERE company_id=$1 AND account_type IN ('CASH','PRIMARY_BANK') AND account_id IS NULL AND entry_date<=$2::timestamp
   ORDER BY entry_date,id`,[companyId,cutoff])).rows;
 const settings=(await db.query(`SELECT COALESCE(cash,0)::numeric::text AS cash,COALESCE(bank,0)::numeric::text AS bank,
   opening_cash_date::text AS cash_date,opening_bank_date::text AS bank_date FROM companies WHERE id=$1`,[companyId])).rows[0];
 const storeOpenings=[{account:'CASH',amount:settings.cash,date:settings.cash_date},{account:'PRIMARY_BANK',amount:settings.bank,date:settings.bank_date}];
 const openingOffset=(await db.query(`SELECT id FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND code='2220' AND is_active AND deleted_at IS NULL AND category IN ('EQUITY','LIABILITY')`,[companyId])).rows[0];
 const openingRecords=(await db.query(`SELECT account_id,journal_id,amount::text,side,as_of_date::text AS date FROM accountant_v2_account_opening_balances WHERE company_id=$1 AND account_id=ANY($2::text[]) AND deleted_at IS NULL`,[companyId,Object.values(targets)])).rows;

 const aliases=(await db.query(`SELECT upper(split_part(source_key,':',1))||':'||substr(source_key,strpos(source_key,':')+1) AS key,journal_id
   FROM accountant_v2_erp_sources WHERE company_id=$1 AND journal_id IS NOT NULL
   UNION SELECT 'DISTRIBUTOR_PAYMENT:'||substr(source_key,9),journal_id FROM accountant_v2_distributor_sources WHERE company_id=$1 AND source_key LIKE 'payment:%' AND journal_id IS NOT NULL
   UNION SELECT 'EXPENSE:'||p.expense_id,s.journal_id FROM accountant_v2_distributor_sources s JOIN distributor_payments p ON p.company_id=s.company_id AND 'payment:'||p.id=s.source_key WHERE s.company_id=$1 AND p.expense_id IS NOT NULL AND s.journal_id IS NOT NULL
   UNION SELECT 'MONEY_TRANSACTION:'||cr.money_transaction_id,s.journal_id FROM accountant_v2_distributor_sources s JOIN distributor_credits cr ON cr.company_id=s.company_id AND 'credit:'||cr.id=s.source_key WHERE s.company_id=$1 AND cr.money_transaction_id IS NOT NULL AND s.journal_id IS NOT NULL
   UNION SELECT 'OPENING:'||company_id||':'||CASE source_id WHEN $2 THEN 'CASH' ELSE 'PRIMARY_BANK' END,id
   FROM accountant_v2_manual_journals WHERE company_id=$1 AND source_type='OPENING_BALANCE' AND source_id IN ($2,$3) AND deleted_at IS NULL
   UNION SELECT 'ACCOUNT_TRANSFER:'||source_id,id FROM accountant_v2_manual_journals WHERE company_id=$1 AND source_type='ACCOUNT_TRANSFER' AND deleted_at IS NULL`,[companyId,targets.CASH,targets.PRIMARY_BANK])).rows;
 const journalIds=[...new Set(aliases.map(a=>a.journal_id))];
 const nativeLines=journalIds.length?(await db.query(`SELECT j.id,j.journal_date::text AS date,l.account_id,l.side::text,round(l.amount*j.exchange_rate,2)::text AS amount
   FROM accountant_v2_manual_journals j LEFT JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL
   AND l.account_id IN (SELECT id FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND account_type IN ('CASH','BANK'))
   WHERE j.company_id=$1 AND j.id=ANY($2::text[]) AND j.deleted_at IS NULL AND j.status='PUBLISHED' AND j.journal_date<=$3::timestamp`,[companyId,journalIds,cutoff])).rows:[];
 const native={}, byJournal=new Map();
 for(const line of nativeLines){if(!byJournal.has(line.id))byJournal.set(line.id,[]);byJournal.get(line.id).push(line);}
 for(const alias of aliases){const records=byJournal.get(alias.journal_id);if(!records)continue;const lines=records.filter(l=>l.account_id);(native[alias.key]??=[]).push({id:alias.journal_id,lines});}
 const imported=(await db.query(`SELECT j.id,j.source_id,l.account_id,l.side::text,l.amount::text,j.journal_date::text AS date,
   audit."after"->>'fingerprint' AS fingerprint,audit."after"->>'offsetAccountId' AS offset_account_id
   FROM accountant_v2_manual_journals j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id
   LEFT JOIN accountant_v2_accountant_audit audit ON audit.company_id=j.company_id AND audit."resourceId"=j.id AND audit.resource='legacy-cash-bank-import' AND audit.action='imported'
   WHERE j.company_id=$1 AND j.source_type=$2 AND j.deleted_at IS NULL AND j.status='PUBLISHED' AND l.deleted_at IS NULL AND j.journal_date<=$3::timestamp`,[companyId,IMPORT_TYPE,cutoff])).rows;
 const imports={};
 for(const l of imported){const r=imports[l.source_id]??={id:l.id,fingerprint:l.fingerprint,offsetAccountId:l.offset_account_id,lines:[],all:[]};r.all.push(l);if(Object.values(targets).includes(l.account_id))r.lines.push(l);}
 for(const r of Object.values(imports))r.valid=r.all.reduce((n,l)=>n+cents(l.amount)*(l.side==='DEBIT'?1n:-1n),0n)===0n && r.all.every(l=>Object.values(targets).includes(l.account_id)||l.account_id===r.offsetAccountId);
 const balances=Object.fromEntries((await db.query(`SELECT l.account_id,COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount*j.exchange_rate ELSE -l.amount*j.exchange_rate END),0)::numeric(24,2)::text AS balance
   FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
   WHERE j.company_id=$1 AND l.account_id=ANY($2::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL AND j.journal_date<=$3::timestamp GROUP BY l.account_id`,[companyId,Object.values(targets),cutoff])).rows.map(r=>[r.account_id,r.balance]));
 const plan=planHistory({companyId,rows,native,imports,targets,balances,offsetAccountId});
 plan.storeOpenings=storeOpenings.map(o=>({...o,accountId:targets[o.account],offsetAccountId:openingOffset?.id||null}));
 for(const opening of storeOpenings){
   const amount=cents(opening.amount), key=`OPENING:${companyId}:${opening.account}`;
   const old=rows.filter(r=>r.source_type==='OPENING' && r.account_type===opening.account);
   if(amount!==0n && !opening.date){plan.conflicts.push({account:opening.account,reason:'Store settings opening amount has no date'});continue;}
   if(opening.date && opening.date>cutoff)continue;
   if(amount===0n){if(old.some(r=>cents(r.amount)!==0n))plan.conflicts.push({account:opening.account,reason:'Old opening row disagrees with zero Store settings opening'});continue;}
   if(old.length!==1 || `${old[0].source_type}:${old[0].source_id}`!==key || old[0].date!==opening.date || cents(old[0].amount)*(old[0].direction==='CREDIT'?1n:-1n)!==amount){
     plan.conflicts.push({account:opening.account,reason:'Store settings opening amount/date disagrees with the old opening row or the row is missing',settings:opening});continue;
   }
   const planned=plan.journals.find(j=>j.source===key);
   const metadata=openingRecords.find(r=>r.account_id===targets[opening.account]);
   if(planned){
     if(!openingOffset){plan.conflicts.push({account:opening.account,reason:'Active Opening Balance Adjustments account (code 2220) is required'});continue;}
     if(metadata){plan.conflicts.push({account:opening.account,reason:'An opening balance record already exists without a matching posted opening'});continue;}
     // Use the normal new-account opening source, so the account editor displays it too.
     planned.sourceType='OPENING_BALANCE';planned.journalSourceId=targets[opening.account];
     planned.opening={accountId:targets[opening.account],side:amount>0n?'DEBIT':'CREDIT',amount:money(amount>0n?amount:-amount)};
     planned.notes=`Store settings opening balance: ${opening.account}`;
     for(const line of planned.lines)if(line.account_id!==targets[opening.account])line.account_id=openingOffset.id;
   }else if(native[key]?.length){
     if(!metadata || metadata.journal_id!==native[key][0].id || metadata.date!==opening.date || cents(metadata.amount)*(metadata.side==='DEBIT'?1n:-1n)!==amount)
       plan.conflicts.push({account:opening.account,reason:'New opening-balance metadata does not match Store settings'});
   }else if(Object.values(imports).some(i=>i.lines.some(l=>l.account_id===targets[opening.account] && l.date===opening.date)))
     plan.conflicts.push({account:opening.account,reason:'Opening was previously imported as ordinary history; review before creating another opening'});
 }

 // The old page displays stored running balances. Do not silently copy an inconsistent ledger.
 for(const [account,id] of Object.entries(targets)){
   const last=(await db.query(`SELECT balance_after::text FROM account_ledger_entries WHERE company_id=$1 AND account_type::text=$2 AND account_id IS NULL AND entry_date<=$3::timestamp ORDER BY entry_date DESC,id DESC LIMIT 1`,[companyId,account,cutoff])).rows[0];
   const expected=plan.reconciliation.find(r=>r.accountId===id).oldBalance;
   if(last&&cents(last.balance_after)!==cents(expected))plan.conflicts.push({account,reason:'Old page running balance differs from the sum of its rows',displayed:last.balance_after,sum:expected});
 }
 const reviewed=review?.companies.find(c=>c.companyId===companyId);
 if(review && !reviewed)throw Error('Company absent from reviewed snapshot');
 return {rowCount:rows.length,...applyReview(plan,reviewed)};
}
try{
 await db.query(apply?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await db.query(`SET LOCAL search_path TO "${schema}"`);await db.query("SET LOCAL lock_timeout='15s'");
 // Lock before the company accounting locks: legacy writes obtain their source-table locks first.
 if(apply)await db.query('LOCK TABLE account_ledger_entries IN SHARE MODE');
 const companyIds=[...new Set(requested.length?requested:(await db.query('SELECT company_id FROM accountant_v2_erp_settings WHERE enabled UNION SELECT company_id FROM accountant_v2_distributor_settings WHERE enabled')).rows.map(r=>r.company_id))].sort();
 if(!companyIds.length)throw Error('No connected companies');
 if((await db.query("SELECT 1 FROM accountant_v2_manual_journals WHERE company_id=ANY($1::text[]) AND source_type='TRANSFER_HISTORY_MIGRATION_REVERSAL' AND deleted_at IS NULL LIMIT 1",[companyIds])).rowCount)throw Error('Transfer history has replaced cash migration entries. Rerun import-transfers, not the old cash import.');
 if(companyIds.length>1&&(get('cash-account')||get('bank-account')||get('offset-account')))throw Error('Explicit account IDs require one company per invocation');
 const cutoff=through?`${through} 23:59:59.999`:(await db.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::timestamp(3)::text AS date")).rows[0].date;
 report.through=cutoff;
 if(review && review.through!==cutoff)throw Error('Reviewed cutoff differs');
 report.review=review; 
 const prepared=[];
 for(const companyId of companyIds){
  if(apply)await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[companyId]);
  const company=(await db.query('SELECT id,name,currency FROM companies WHERE id=$1',[companyId])).rows[0];if(!company)throw Error('Unknown company');
  const accounts=(await db.query('SELECT id,name,code,account_type::text,is_primary,category::text FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND is_active AND deleted_at IS NULL',[companyId])).rows;
  const select=(id,predicate,label)=>{const matches=accounts.filter(a=>id?a.id===id:predicate(a));if(matches.length!==1)throw Error(`${company.name}: select exactly one ${label} using its account ID`);return matches[0];};
  const cash=select(get('cash-account'),a=>a.account_type==='CASH'&&a.code==='1001','cash account');
  const bank=select(get('bank-account'),a=>a.account_type==='BANK'&&a.is_primary,'primary bank');
  if(cash.account_type!=='CASH'||bank.account_type!=='BANK')throw Error('Cash/bank account types must match');
  let offset=get('offset-account')?select(get('offset-account'),()=>false,'offset account'):null;
  if(offset&&(['CASH','BANK'].includes(offset.account_type)||!['EQUITY','LIABILITY'].includes(offset.category)))throw Error('Select an equity or liability migration offset account');
  if(args.includes('--migration-clearing')){
   const id='c'+hash(companyId+'legacy-cash-bank-clearing').slice(0,24);
   offset=accounts.find(a=>a.id===id);
   if(!offset){
    offset={id,name:'Legacy cash/bank migration clearing',code:'LCB-CLEARING',account_type:'EQUITY',category:'EQUITY'};
    if(apply)await db.query(`INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,code,account_type,category,currency,updated_at) VALUES($1,$2,$3,$4,'EQUITY','EQUITY',$5,now())`,[id,companyId,offset.name,offset.code,company.currency||'INR']);
   }
   if(offset.category!=='EQUITY'||offset.account_type!=='EQUITY')throw Error('Migration clearing account has changed type');
  }
  const targets={CASH:cash.id,PRIMARY_BANK:bank.id};
  const plan=await load(companyId,targets,offset?.id,cutoff);
  const earliest=plan.journals.map(j=>j.date).sort()[0];
  if(earliest){
   const locked=(await db.query(`SELECT lock_date::text FROM accountant_v2_transaction_locks WHERE company_id=$1 AND is_locked AND deleted_at IS NULL AND module IN ('ALL','ACCOUNTS','BANKING') AND lock_date>=$2::timestamp LIMIT 1`,[companyId,earliest])).rows[0];
   if(locked)plan.conflicts.push({reason:'Accounting or banking period is locked',date:locked.lock_date});
  }
  const summary={company:company.name,companyId,accounts:{cash,bank,offset},legacyRows:plan.rowCount,missingJournals:plan.journals.length,reusedSources:plan.reused.length,unchangedImports:plan.unchanged.length,
   storeOpenings:plan.storeOpenings,offsetRequired:!offset&&plan.journals.some(j=>j.lines.some(l=>l.account_id==='OFFSET_ACCOUNT_REQUIRED')),reconciliation:plan.reconciliation,conflicts:plan.conflicts,acceptedConflicts:plan.acceptedConflicts||[],
   entries:plan.journals.map(j=>({sourceType:j.sourceType||IMPORT_TYPE,source:j.source,date:j.date,reference:j.entryNumber,total:j.total,lines:j.lines})),reused:plan.reused};
  report.companies.push(summary);prepared.push({company,targets,offset,plan});
 }
 const blocked=report.companies.some(c=>c.conflicts.length || (apply&&c.offsetRequired));
 if(apply&&!blocked){
  for(const {company,targets,offset,plan} of prepared){
   for(let start=0;start<plan.journals.length;start+=250){
    const batch=plan.journals.slice(start,start+250);
    await db.query(`INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,updated_at)
      SELECT x.id,$1,x.number,x.date::timestamp,x.reference,x.notes,$2,x.total::numeric,'PUBLISHED',now(),true,x.source_type,x.source_id,now()
      FROM jsonb_to_recordset($3::jsonb) AS x(id text,number text,date text,reference text,notes text,total text,source_id text,source_type text)`,[company.id,company.currency||'INR',JSON.stringify(batch.map(j=>({id:j.id,number:j.entryNumber,date:j.date,reference:j.source,notes:j.notes,total:j.total,source_id:j.journalSourceId||j.sourceId,source_type:j.sourceType||IMPORT_TYPE})))]);
    await db.query(`INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,updated_at)
      SELECT x.id,$1,x.journal_id,x.account_id,x.side::"AccountantJournalEntrySide",x.amount::numeric,x.description,now()
      FROM jsonb_to_recordset($2::jsonb) AS x(id text,journal_id text,account_id text,side text,amount text,description text)`,[company.id,JSON.stringify(batch.flatMap(j=>j.lines.map(l=>({...l,journal_id:j.id,description:j.notes}))))]);
    const openings=batch.filter(j=>j.opening);
    if(openings.length)await db.query(`INSERT INTO accountant_v2_account_opening_balances(id,company_id,account_id,as_of_date,side,amount,currency,journal_id,notes,updated_at)
      SELECT x.id,$1,x.account_id,x.date::timestamp,x.side,x.amount::numeric,$2,x.journal_id,'Imported from Store settings',now()
      FROM jsonb_to_recordset($3::jsonb) AS x(id text,account_id text,date text,side text,amount text,journal_id text)`,[company.id,company.currency||'INR',JSON.stringify(openings.map(j=>({id:'c'+hash(j.id+'opening').slice(0,24),account_id:j.opening.accountId,date:j.date,side:j.opening.side,amount:j.opening.amount,journal_id:j.id})))]);
    await db.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
      SELECT x.id,$1,'legacy-cash-bank-import','imported','legacy-cash-bank-import',x.journal_id,x.meta,now()
      FROM jsonb_to_recordset($2::jsonb) AS x(id text,journal_id text,meta jsonb)`,[company.id,JSON.stringify(batch.map(j=>({id:'c'+hash(j.id+'audit').slice(0,24),journal_id:j.id,meta:{fingerprint:j.fingerprint,offsetAccountId:offset?.id||null,source:j.source,through:cutoff,reviewHash:review?hash(JSON.stringify(review)):null}})))]);
   }
   // Large imports change these tables from empty/small to tens of thousands of
   // rows in one transaction. Refresh statistics before the provenance join so
   // the repeat check does not repeatedly scan all same-company audit records.
   await db.query('ANALYZE accountant_v2_manual_journals');
   await db.query('ANALYZE accountant_v2_manual_journal_lines');
   await db.query('ANALYZE accountant_v2_accountant_audit');
   const repeat=await load(company.id,targets,offset?.id,cutoff);
   if(repeat.journals.length||repeat.conflicts.length)throw Error(`${company.name}: repeat or reconciliation verification failed; rolled back`);
  }
  await db.query('COMMIT');report.applied=true;
 }else await db.query('ROLLBACK');
 report.blocked=blocked;save();
 console.log(JSON.stringify({applied:report.applied,blocked,report:reportPath,companies:report.companies.map(c=>({company:c.company,legacyRows:c.legacyRows,missingJournals:c.missingJournals,reusedSources:c.reusedSources,offsetRequired:c.offsetRequired,conflicts:c.conflicts.length,reconciliation:c.reconciliation}))},null,2));
 if(blocked)process.exitCode=2;
}catch(error){await db.query('ROLLBACK');report.error=error.message;save();throw error;}finally{db.release();await pool.end();}
