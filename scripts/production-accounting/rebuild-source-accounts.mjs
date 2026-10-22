import 'dotenv/config';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { openSync, closeSync, writeSync, fsyncSync, writeFileSync, mkdirSync, readFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

// Task-specific targets. This script never installs or changes database objects.
const targets = [
  ['6980e6e4-7d5d-413c-9554-24f385c9b853','ORIGINALS CLOTHING'],
  ['1c1feec8-d0fe-432d-911c-ec14ce4f8475','Shobika Women Boutique'],
  ['f3f1d8cf-60e2-464d-9416-36e5fad087ec','City Center'],
];
const ids = targets.map(t=>t[0]);
const apply = process.argv.includes('--apply');
const opt = key => process.argv.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
for (const a of process.argv.slice(2)) if (!['--apply','--reuse-backup'].includes(a) && !['backup','report','reuse-backup-report'].some(k=>a.startsWith(`--${k}=`))) throw Error(`Unknown argument ${a}`);
if (apply && !opt('backup')) throw Error('Exclusive backup path required');
const report = { at: new Date().toISOString(), applied: false, companies: [], backup: opt('backup') };
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
const db = await pool.connect();
const query = async (sql,args=[]) => (await db.query(sql,args)).rows;
const balances = async company => query(`SELECT l.account_id,round(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END*j.exchange_rate),2)::text amount
  FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
  WHERE j.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY l.account_id
  HAVING round(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END*j.exchange_rate),2)<>0 ORDER BY l.account_id`,[company]);
async function plan(company) {
  const pairs = await query(`SELECT r.id reversal_id,o.id original_id,r.source_type reversal_type,o.source_type original_type
    FROM accountant_v2_manual_journals r JOIN accountant_v2_manual_journals o ON o.id=r.reversed_from_id AND o.company_id=r.company_id
    WHERE r.company_id=$1 AND r.source_type IN ('ERP_HISTORY_MIGRATION_REVERSAL','TRANSFER_HISTORY_MIGRATION_REVERSAL','ERP_REVERSAL','DISTRIBUTOR_REVERSAL','PURCHASE_ORDER_SOURCE_REVERSAL')
      AND r.status='PUBLISHED' AND o.status='PUBLISHED' AND r.deleted_at IS NULL AND o.deleted_at IS NULL
      AND r.journal_date=o.journal_date AND r.currency=o.currency AND r.exchange_rate=o.exchange_rate`,[company]);
  const journals = pairs.flatMap(p=>[p.original_id,p.reversal_id]);
  if (new Set(journals).size!==journals.length) throw Error('Overlapping reversal pairs');
  const mismatch = await query(`WITH pairs AS (
    SELECT r.id rid,o.id oid,r.source_type FROM accountant_v2_manual_journals r JOIN accountant_v2_manual_journals o ON o.id=r.reversed_from_id AND o.company_id=r.company_id
    WHERE r.company_id=$1 AND r.id=ANY($2::text[])
  ) SELECT p.rid,l.account_id,coalesce(l.distributor_id,l.source_parties->'distributor'->>'id','') supplier,coalesce(l.party_id,'') contact,
      CASE WHEN l.source_parties->'distributor'->>'id'=coalesce(l.distributor_id,l.source_parties->'distributor'->>'id')
        THEN l.source_parties-'distributor' ELSE coalesce(l.source_parties,'{}') END dimensions
    FROM pairs p JOIN accountant_v2_manual_journal_lines l ON l.company_id=$1 AND l.journal_id IN (p.rid,p.oid) AND l.deleted_at IS NULL
    GROUP BY 1,2,3,4,5 HAVING sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)<>0`,[company,pairs.map(p=>p.reversal_id)]);
  if (mismatch.length) throw Error(`Reversal dimensions do not cancel: ${JSON.stringify(mismatch.slice(0,3))}`);
  const columns = await query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema()
    AND table_name LIKE 'accountant_v2_%' AND column_name LIKE '%journal_id' AND table_name<>'accountant_v2_manual_journal_lines'`);
  for (const col of columns) {
    if (!/^[a-z0-9_]+$/.test(col.table_name+col.column_name)) throw Error('Unexpected metadata identifier');
    const links = await query(`SELECT 1 FROM "${col.table_name}" WHERE company_id=$1 AND "${col.column_name}"=ANY($2::text[]) LIMIT 1`,[company,journals]);
    if (links.length) throw Error(`Cancelled journal is still referenced by ${col.table_name}`);
  }
  const external = await query(`SELECT id FROM accountant_v2_manual_journals WHERE company_id=$1 AND reversed_from_id=ANY($2::text[]) AND NOT(id=ANY($2::text[]))`,[company,journals]);
  if (external.length) throw Error('Another reversal still references a selected journal');
  const locked = await query(`SELECT j.id FROM accountant_v2_manual_journals j JOIN accountant_v2_transaction_locks k
    ON k.company_id=j.company_id AND k.is_locked AND k.deleted_at IS NULL AND k.module IN ('ALL','ACCOUNTS','BANKING') AND j.journal_date<=k.lock_date
    WHERE j.company_id=$1 AND j.id=ANY($2::text[]) LIMIT 1`,[company,journals]);
  if (locked.length) throw Error('Selected accounting dates are locked');
  return { pairs, journals };
}
async function sourceHashes() {
  const result = {};
  for (const table of ['bills','entries','expenses','purchase_orders','distributor_credits','distributor_payments','purchase_returns','money_transactions','account_transfers','investments','salary_payments','user_ledger_entries','items','variants','account_ledger_entries']) {
    result[table] = await query(`SELECT company_id,count(*)::int count,md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY id),'')) hash FROM "${table}" t WHERE company_id=ANY($1::text[]) GROUP BY company_id ORDER BY company_id`,[ids]);
  }
  return JSON.stringify(result);
}
async function backup() {
  const fd = openSync(opt('backup'),'wx');
  const hash = createHash('sha256');
  let count=0;
  const write = data => { writeSync(fd,data); hash.update(data); };
  try {
    write(JSON.stringify({ format:'accounting-source-rebuild-jsonl-v1', at:report.at, companies:targets })+'\n');
    const tables = await query(`SELECT table_name FROM information_schema.columns WHERE table_schema=current_schema() AND column_name='company_id'
      AND (table_name LIKE 'accountant_v2_%' OR table_name IN ('bills','entries','expenses','purchase_orders','distributor_credits','distributor_payments','purchase_returns','money_transactions','account_transfers','investments','account_ledger_entries')) ORDER BY table_name`);
    for (const {table_name:table} of tables) {
      if (!/^[a-z0-9_]+$/.test(table)) throw Error('Unexpected table name');
      await db.query(`DECLARE backup_rows NO SCROLL CURSOR FOR SELECT row_to_json(t)::text data FROM "${table}" t WHERE company_id=ANY($1::text[])`,[ids]);
      let n=0;
      while(true) {
        const rows=await query('FETCH 5000 FROM backup_rows');
        if(!rows.length) break;
        write(rows.map(row=>`{"table":${JSON.stringify(table)},"row":${row.data}}\n`).join(''));
        n+=rows.length;
      }
      await db.query('CLOSE backup_rows');
      count+=n;
      console.log(JSON.stringify({backupTable:table,rows:n}));
    }
    fsyncSync(fd);
    report.backupRows=count; report.backupSha256=hash.digest('hex');
  } finally { closeSync(fd); }
}
async function reuseBackup() {
  const previous=opt('reuse-backup-report')?JSON.parse(readFileSync(opt('reuse-backup-report'),'utf8')):null;
  if(previous && (previous.applied || !previous.error || previous.backup!==opt('backup') || !previous.backupSha256 || !previous.sourceHashes))throw Error('Only a complete backup from a rolled-back run can be reused');
  const fileHash=createHash('sha256');
  const expected=new Map();
  let table,hashes=[],rows=0,manifest=false;
  const finish=()=>{if(table)expected.set(table,{count:hashes.length,hash:createHash('md5').update(hashes.sort().join('')).digest('hex')});hashes=[];};
  for await(const line of createInterface({input:createReadStream(opt('backup')),crlfDelay:Infinity})) {
    fileHash.update(line+'\n');
    if(!manifest){const m=JSON.parse(line);if(m.format!=='accounting-source-rebuild-jsonl-v1'||JSON.stringify(m.companies)!==JSON.stringify(targets))throw Error('Backup manifest mismatch');manifest=true;continue;}
    const match=/^\{"table":("[a-z0-9_]+"),"row":(.*)\}$/.exec(line);
    if(!match)throw Error('Invalid backup record');
    const next=JSON.parse(match[1]);
    if(next!==table){finish();if(expected.has(next))throw Error('Repeated backup table');table=next;}
    hashes.push(createHash('md5').update(match[2]).digest('hex'));rows++;
  }
  finish();
  const digest=fileHash.digest('hex');
  if(previous && (digest!==previous.backupSha256||rows!==previous.backupRows))throw Error('Backup integrity mismatch');
  // This runs under the same source/company locks as a fresh backup. Any new or
  // changed row, including a zero-net journal, rejects reuse before writes.
  const tables=await query(`SELECT table_name FROM information_schema.columns WHERE table_schema=current_schema() AND column_name='company_id'
    AND (table_name LIKE 'accountant_v2_%' OR table_name IN ('bills','entries','expenses','purchase_orders','distributor_credits','distributor_payments','purchase_returns','money_transactions','account_transfers','investments','account_ledger_entries')) ORDER BY table_name`);
  for(const {table_name:tableName} of tables) {
    const [actual]=await query(`SELECT count(*)::int count,md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) hash FROM "${tableName}" t WHERE company_id=ANY($1::text[])`,[ids]);
    const saved=expected.get(tableName)||{count:0,hash:createHash('md5').update('').digest('hex')};
    if(actual.count!==saved.count||actual.hash!==saved.hash)throw Error(`Backup is stale for ${tableName}; a fresh backup is required`);
  }
  if(previous && JSON.stringify(previous.sourceHashes)!==await sourceHashes())throw Error('A source outside the backup changed; fresh backup required');
  report.backupRows=rows;report.backupSha256=digest;report.backupReusedAfterExactVerification=true;
  console.log(JSON.stringify({backupReused:true,rows,sha256:report.backupSha256}));
}
async function syncErp(company) {
  const sources = await query(`SELECT source_key FROM accountant_v2_erp_sources WHERE company_id=$1
    UNION SELECT 'bill:'||id FROM bills WHERE company_id=$1
    UNION SELECT 'expense:'||id FROM expenses WHERE company_id=$1 ORDER BY source_key`,[company]);
  let changed=0;
  for(let i=0;i<sources.length;i+=500) {
    const [r]=await query(`SELECT coalesce(sum(accountant_v2_sync_erp($1,upper(split_part(source_key,':',1)),substr(source_key,strpos(source_key,':')+1),true)),0)::int changed
      FROM jsonb_to_recordset($2::jsonb) s(source_key text)`,[company,JSON.stringify(sources.slice(i,i+500))]);
    changed+=r.changed;
    if(i%5000===0) console.log(JSON.stringify({company,checked:Math.min(i+500,sources.length),total:sources.length,changed}));
  }
  return {checked:sources.length,changed};
}
async function verifyErpLines(company) {
  const mismatch=await query(`WITH expected AS (
    SELECT s.source_key,s.accounts->>(v->>'role') account_id,sum((v->>'amount')::numeric) amount FROM accountant_v2_erp_sources s
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.signature->'lines','[]')) v WHERE company_id=$1 GROUP BY 1,2
  ), actual AS (
    SELECT s.source_key,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount FROM accountant_v2_erp_sources s
    JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=s.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL
    JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL WHERE s.company_id=$1 GROUP BY 1,2
  ) SELECT coalesce(e.source_key,a.source_key) source_key FROM expected e FULL JOIN actual a USING(source_key,account_id) WHERE coalesce(e.amount,0)<>coalesce(a.amount,0)`,[company]);
  if(mismatch.length) throw Error(`Current ERP lines differ from source: ${JSON.stringify(mismatch.slice(0,5))}`);
}
async function legacySourceTypes(company) {
  const investors=await query(`SELECT j.id,j.source_id,e.id event_id FROM accountant_v2_manual_journals j
    JOIN accountant_v2_investor_events e ON e.company_id=j.company_id AND e.journal_id=j.id AND e.id=j.source_id
    JOIN investments i ON i.company_id=e.company_id AND i.id=e.legacy_id AND i.status='COMPLETED' AND i.amount=e.amount
    WHERE j.company_id=$1 AND j.source_type='LEGACY_INVESTOR' AND j.status='PUBLISHED' AND j.deleted_at IS NULL
    AND j.journal_date::date=e.event_date AND e.kind=CASE i.direction WHEN 'IN' THEN 'CAPITAL_IN' ELSE 'CAPITAL_OUT' END
    AND j.total=e.amount`,[company]);
  const money=await query(`SELECT j.id,m.id source_id,m.direction FROM accountant_v2_manual_journals j
    JOIN money_transactions m ON m.company_id=j.company_id AND j.reference_number='MONEY_TRANSACTION:'||m.id
    JOIN accountant_v2_accountant_audit a ON a.company_id=m.company_id AND a.resource='transaction-history-import' AND a.action='imported'
      AND a."resourceId"=m.id AND a."after"->>'journalId'=j.id
    WHERE j.company_id=$1 AND j.source_type='LEGACY_CASH_BANK_HISTORY' AND j.status='PUBLISHED' AND j.deleted_at IS NULL
      AND m.status='PAID' AND m.amount=j.total AND m.created_at=j.journal_date AND j.exchange_rate=1
      AND NOT EXISTS(SELECT 1 FROM accountant_v2_manual_journals r WHERE r.reversed_from_id=j.id)
      AND (SELECT count(*) FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_accounting_accounts ac ON ac.id=l.account_id AND ac.company_id=l.company_id
        WHERE l.journal_id=j.id AND l.deleted_at IS NULL AND ac.account_type IN ('CASH','BANK')
        AND l.amount=m.amount AND l.side=CASE m.direction WHEN 'RECEIVED' THEN 'DEBIT'::"AccountantJournalEntrySide" ELSE 'CREDIT'::"AccountantJournalEntrySide" END)=1`,[company]);
  return [...investors.map(r=>({...r,type:'INVESTOR'})),...money.map(r=>({...r,type:r.direction==='RECEIVED'?'MONEY_RECEIVE':'MONEY_PAY'}))];
}
async function verifySupplierLines(company) {
  const mismatch=await query(`WITH events AS (
    SELECT e.*,s.accounts,s.journal_id FROM accountant_v2_distributor_events e
    JOIN accountant_v2_distributor_settings cfg ON cfg.company_id=e.company_id AND cfg.distributor_id=e.distributor_id AND cfg.enabled
    LEFT JOIN accountant_v2_distributor_sources s ON s.company_id=e.company_id AND s.distributor_id=e.distributor_id AND s.source_key=e.source_key WHERE e.company_id=$1
  ), expected AS (
    SELECT distributor_id,source_key,accounts->>'payable' account_id,CASE WHEN kind IN ('PAYMENT','RETURN') THEN abs(amount) ELSE -amount END amount FROM events
    UNION ALL SELECT distributor_id,source_key,accounts->>'stock',CASE WHEN kind='RETURN' THEN -(abs(amount)-tax) ELSE abs(amount)-tax END FROM events WHERE kind IN ('PURCHASE','RETURN')
    UNION ALL SELECT distributor_id,source_key,accounts->>'tax',CASE WHEN kind='RETURN' THEN -tax ELSE tax END FROM events WHERE kind IN ('PURCHASE','RETURN')
    UNION ALL SELECT distributor_id,source_key,CASE WHEN kind='OPENING' THEN accounts->>'opening' WHEN mode='CASH' THEN accounts->>'cash' WHEN bank_id IS NOT NULL THEN accounts->>('bank:'||bank_id) ELSE accounts->>'bank' END,
      CASE WHEN kind='PAYMENT' THEN -amount ELSE amount END FROM events WHERE kind NOT IN ('PURCHASE','RETURN')
  ), totals AS (SELECT distributor_id,source_key,account_id,sum(amount) amount FROM expected GROUP BY 1,2,3), actual AS (
    SELECT e.distributor_id,e.source_key,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount FROM events e
    JOIN accountant_v2_manual_journals j ON j.id=e.journal_id AND j.company_id=e.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL
    JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL GROUP BY 1,2,3
  ) SELECT coalesce(e.source_key,a.source_key) source_key FROM totals e FULL JOIN actual a USING(distributor_id,source_key,account_id) WHERE coalesce(e.amount,0)<>coalesce(a.amount,0)`,[company]);
  if(mismatch.length)throw Error(`Supplier source lines do not reconcile: ${JSON.stringify(mismatch.slice(0,5))}`);
}
try {
  await db.query(apply?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw Error('Invalid schema');
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query("SET LOCAL lock_timeout='15s'");
  await db.query("SET LOCAL statement_timeout='120s'");
  const companies=await query('SELECT id,name FROM companies WHERE id=ANY($1::text[]) ORDER BY id',[ids]);
  if(companies.length!==3 || companies.some(c=>!targets.some(t=>t[0]===c.id&&t[1]===c.name)))throw Error('Company identity mismatch');
  if(apply) {
    await db.query('LOCK TABLE bills,entries,expenses,purchase_orders,distributor_credits,distributor_payments,purchase_returns,money_transactions,account_transfers,investments,items,variants IN SHARE MODE');
    for(const c of companies) {
      await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[c.id]);
      await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[c.id]);
    }
    await db.query('LOCK TABLE accountant_v2_manual_journals,accountant_v2_manual_journal_lines IN SHARE ROW EXCLUSIVE MODE');
    if(opt('reuse-backup-report') || process.argv.includes('--reuse-backup'))await reuseBackup();else await backup();
    await db.query("SELECT set_config('app.accountant_user','authorized-source-rebuild',true)");
  }
  const beforeSources=await sourceHashes();
  report.sourceHashes=JSON.parse(beforeSources);
  for(const c of companies) {
    const r={company:c.name,companyId:c.id,before:await balances(c.id)};
    if(apply) {
      await db.query("SELECT set_config('app.stock_sync',$1,true)",[c.id]);
      r.erp=await syncErp(c.id);
      const suppliers=await query('SELECT distributor_id FROM accountant_v2_distributor_settings WHERE company_id=$1 AND enabled',[c.id]);
      r.supplierChanges=0;
      for(const s of suppliers) r.supplierChanges+=Number((await query('SELECT accountant_v2_sync_distributor($1,$2) changed',[c.id,s.distributor_id]))[0].changed);
      const purchases=await query(`SELECT DISTINCT "resourceId" id FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='purchase-order-header-authority'`,[c.id]);
      r.purchaseChanges=0;
      for(const p of purchases) r.purchaseChanges+=Number((await query('SELECT accountant_v2_sync_unassigned_purchase($1,$2) changed',[c.id,p.id]))[0].changed);
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      await db.query('SET CONSTRAINTS ALL DEFERRED');
      await db.query("SELECT set_config('app.stock_sync','',true)");
      r.stockChanges=Number((await query('SELECT accountant_v2_sync_stock($1) changed',[c.id]))[0].changed);
    }
    await verifyErpLines(c.id);
    await verifySupplierLines(c.id);
    const selected=await plan(c.id);
    const reclassify=await legacySourceTypes(c.id);
    r.sourceTypesReclassified=reclassify.length;
    r.pairs=selected.pairs.length;
    r.archiveCount=selected.journals.length;
    r.pairTypes=Object.fromEntries([...new Set(selected.pairs.map(p=>p.reversal_type))].map(t=>[t,selected.pairs.filter(p=>p.reversal_type===t).length]));
    if(apply) {
      const beforeCleanup=await balances(c.id);
      await db.query("SELECT set_config('app.stock_sync',$1,true)",[c.id]);
      for(const row of reclassify) await db.query('UPDATE accountant_v2_manual_journals SET source_type=$3,source_id=$4,updated_at=now() WHERE company_id=$1 AND id=$2',[c.id,row.id,row.type,row.source_id]);
      let removed=0;
      for(let i=0;i<selected.journals.length;i+=2000) {
        removed+=(await db.query('UPDATE accountant_v2_manual_journals SET deleted_at=now(),updated_at=now() WHERE company_id=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL',[c.id,selected.journals.slice(i,i+2000)])).rowCount;
        if(i%20000===0) console.log(JSON.stringify({company:c.name,removed,total:selected.journals.length}));
      }
      if(removed!==r.archiveCount)throw Error('Unexpected archive count');
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      await db.query('SET CONSTRAINTS ALL DEFERRED');
      await db.query("SELECT set_config('app.stock_sync','',true)");
      if(JSON.stringify(beforeCleanup)!==JSON.stringify(await balances(c.id)))throw Error('Pair removal changed account balances');
      if(Number((await query('SELECT accountant_v2_sync_stock($1) changed',[c.id]))[0].changed)!==0)throw Error('Pair removal changed stock reconciliation');
      r.repeatErp=await syncErp(c.id);
      if(r.repeatErp.changed)throw Error('Source repeat changed accounting');
      for(const s of await query('SELECT distributor_id FROM accountant_v2_distributor_settings WHERE company_id=$1 AND enabled',[c.id])) {
        if(Number((await query('SELECT accountant_v2_sync_distributor($1,$2) changed',[c.id,s.distributor_id]))[0].changed)!==0)throw Error('Supplier repeat changed accounting');
      }
      await verifyErpLines(c.id);
      await verifySupplierLines(c.id);
      r.after=await balances(c.id);
      r.sourceLinesMatch=true; r.cleanupBalancesUnchanged=true;
      const auditId=randomUUID();
      await db.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
        VALUES($1,$2,'authorized-source-rebuild','rebuilt','source-accounting-rebuild',$1,$3::jsonb,now())`,[auditId,c.id,JSON.stringify({backup:opt('backup'),backupSha256:report.backupSha256,pairs:selected.pairs,reclassified:reclassify,summary:r})]);
    }
    report.companies.push(r);
    console.log(JSON.stringify({company:c.name,pairs:r.pairs,archiveCount:r.archiveCount,pairTypes:r.pairTypes,erp:r.erp}));
  }
  if(beforeSources!==await sourceHashes())throw Error('Operational source/archive records changed');
  report.sourcesUnchanged=true;
  report.unbalanced=await query(`SELECT j.id FROM accountant_v2_manual_journals j LEFT JOIN accountant_v2_manual_journal_lines l
    ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL
    WHERE j.company_id=ANY($1::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL GROUP BY j.id
    HAVING coalesce(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0)<>0`,[ids]);
  if(report.unbalanced.length)throw Error('Unbalanced published journal');
  await db.query(apply?'COMMIT':'ROLLBACK');
  report.applied=apply;
} catch(error) {
  await db.query('ROLLBACK'); report.error=error.message; process.exitCode=1;
} finally {
  db.release(); await pool.end();
  mkdirSync('../artifacts',{recursive:true});
  writeFileSync(opt('report')||'../artifacts/source-rebuild-preview.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({applied:report.applied,error:report.error,companies:report.companies.map(c=>({company:c.company,archiveCount:c.archiveCount,pairs:c.pairs})),backup:report.backup,backupSha256:report.backupSha256}));
}
