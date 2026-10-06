import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { Pool } from 'pg';
dotenv.config({quiet:true});
const companyId='6980e6e4-7d5d-413c-9554-24f385c9b853';
const investorId='b0cdae03-95d4-4560-801c-8fe5a70ffb2d';
const dir='scripts/production-accounting/runs/originals-settings-selection-2026-10-06';
const apply=process.argv.includes('--apply');
const pool=new Pool({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,connectionTimeoutMillis:15000});
const db=await pool.connect();
const cents=n=>Math.round(Number(n)*100);
try {
  await db.query(apply?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query('SET LOCAL search_path TO public');
  if(apply){
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`accountant-v2:${companyId}`]);
    await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[companyId]);
  }
  const company=(await db.query('SELECT id,name FROM companies WHERE id=$1',[companyId])).rows[0];
  assert.equal(company.name,'ORIGINALS CLOTHING');
  const source=(await db.query('SELECT * FROM investments WHERE company_id=$1 ORDER BY id',[companyId])).rows;
  const investors=(await db.query('SELECT * FROM accountant_v2_investors WHERE company_id=$1 ORDER BY id',[companyId])).rows;
  const p=investors.find(i=>i.id===investorId);
  assert.ok(p);assert.equal(investors.length,1);
  assert.equal(source.length,12);assert.ok(source.every(s=>s.status==='COMPLETED'&&s.userId===p.legacy_user_id));
  const events=(await db.query('SELECT * FROM accountant_v2_investor_events WHERE company_id=$1 ORDER BY id',[companyId])).rows;
  assert.equal(events.length,12);assert.ok(events.every(e=>e.investor_id===p.id&&e.legacy_id));
  const journalIds=events.map(e=>e.journal_id);
  assert.equal(new Set(journalIds).size,12);
  const journals=(await db.query('SELECT * FROM accountant_v2_manual_journals WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY id',[companyId,journalIds])).rows;
  const lines=(await db.query('SELECT * FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND journal_id=ANY($2::text[]) ORDER BY id',[companyId,journalIds])).rows;
  assert.equal(journals.length,12);assert.equal(lines.length,24);
  const defaults=(await db.query(`SELECT "after" FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='account-defaults' AND "resourceId"='investments' AND action='configured' AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1`,[companyId])).rows[0]?.after;
  const accounts=(await db.query('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1 ORDER BY id',[companyId])).rows;
  const mapping={...p.accounts};
  for(const [key,category,type] of [['capital','EQUITY','EQUITY'],['profit','LIABILITY','OTHER_CURRENT_LIABILITY'],['loan','LIABILITY','OTHER_LIABILITY']]){
    const id=defaults?.[`${key}AccountId`],a=accounts.find(a=>a.id===id);
    assert.ok(a&&a.is_active&&!a.deleted_at&&a.category===category&&a.account_type===type,`Invalid company ${key} default`);
    mapping[key]=id;
  }
  const changes=[];
  let sourceNet=0,postingNet=0;
  for(const e of events){
    const s=source.find(s=>s.id===e.legacy_id),j=journals.find(j=>j.id===e.journal_id);
    assert.ok(s&&j);assert.ok(j.status==='PUBLISHED'&&!j.deleted_at);
    assert.ok(['IN','OUT'].includes(s.direction));
    assert.equal(e.kind,s.direction==='IN'?'CAPITAL_IN':'CAPITAL_OUT');
    assert.equal(cents(e.amount),cents(s.amount));assert.equal(cents(j.total),cents(s.amount));
    const pair=lines.filter(l=>l.journal_id===j.id);
    assert.equal(pair.length,2);assert.ok(pair.every(l=>!l.deleted_at&&cents(l.amount)===cents(s.amount)));
    const purpose=pair.find(l=>l.account_id===p.accounts.capital);
    const counter=pair.find(l=>l.account_id!==p.accounts.capital);
    assert.ok(purpose&&counter);assert.equal(purpose.side,s.direction==='IN'?'CREDIT':'DEBIT');
    assert.equal(counter.side,s.direction==='IN'?'DEBIT':'CREDIT');
    const cashAccount=accounts.find(a=>a.id===counter.account_id);
    assert.equal(cashAccount?.account_type,s.payment_mode==='CASH'?'CASH':'BANK');
    assert.equal(counter.account_id,e.details.mapping.counterAccountId);
    for(const l of pair)assert.deepEqual(l.source_parties?.investor,{id:p.id,name:p.name});
    if(purpose.account_id!==mapping.capital)changes.push({lineId:purpose.id,journalId:j.id,sourceId:s.id,from:purpose.account_id,to:mapping.capital,amount:purpose.amount,side:purpose.side});
    sourceNet+=cents(s.amount)*(s.direction==='IN'?1:-1);
    postingNet+=cents(purpose.amount)*(purpose.side==='CREDIT'?1:-1);
  }
  assert.equal(sourceNet,28500000);assert.equal(postingNet,sourceNet);
  const unchangedTables=(await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'accountant_v2_%' AND tablename NOT IN ('accountant_v2_investors','accountant_v2_manual_journal_lines','accountant_v2_accountant_audit') ORDER BY tablename`)).rows.map(r=>r.tablename);
  async function fingerprints(){
    const result={};
    for(const table of [...unchangedTables,'investments']){
      assert.match(table,/^[a-z_0-9]+$/);
      result[table]=(await db.query(`SELECT count(*)::int AS rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS hash FROM (SELECT md5(to_jsonb(t)::text) AS h FROM public.${table} t WHERE company_id=$1) x`,[companyId])).rows[0];
    }
    // All other journal rows, plus every column except account_id/updated_at on changed rows, stay exact.
    result.journalLines=(await db.query(`SELECT count(*)::int AS rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS hash FROM (SELECT md5((CASE WHEN id=ANY($2::text[]) THEN to_jsonb(t)-'account_id'-'updated_at' ELSE to_jsonb(t) END)::text) AS h FROM accountant_v2_manual_journal_lines t WHERE company_id=$1) x`,[companyId,changes.map(c=>c.lineId)])).rows[0];
    result.investors=(await db.query(`SELECT md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS hash FROM (SELECT md5((CASE WHEN id=$2 THEN to_jsonb(t)-'accounts' ELSE to_jsonb(t) END)::text) AS h FROM accountant_v2_investors t WHERE company_id=$1) x`,[companyId,p.id])).rows[0];
    return result;
  }
  const before=await fingerprints();
  const report={at:new Date().toISOString(),company,investor:{id:p.id,name:p.name},applied:false,schemaChanged:false,sourceRecords:source.length,journals:journals.length,changedLines:changes.length,sourceNetCapital:sourceNet/100,postedNetCapital:postingNet/100,beforeAccounts:p.accounts,afterAccounts:mapping,changes};
  if(apply){
    const backup=`${dir}/investment-remap-backup-${new Date().toISOString().replaceAll(':','-')}.json`;
    fs.writeFileSync(backup,JSON.stringify({at:report.at,company,source,investors,events,journals,lines,accounts,fingerprints:before},null,2),{flag:'wx'});
    report.backup=backup;
    for(const c of changes){
      const updated=await db.query('UPDATE accountant_v2_manual_journal_lines SET account_id=$1,updated_at=now() WHERE company_id=$2 AND id=$3 AND account_id=$4',[c.to,companyId,c.lineId,c.from]);
      assert.equal(updated.rowCount,1);
    }
    const updated=await db.query('UPDATE accountant_v2_investors SET accounts=$1::jsonb WHERE company_id=$2 AND id=$3 AND accounts=$4::jsonb',[JSON.stringify(mapping),companyId,p.id,JSON.stringify(p.accounts)]);
    assert.equal(updated.rowCount,1);
    await db.query(`INSERT INTO accountant_v2_accountant_audit (id,company_id,"userId",action,resource,"resourceId","after",created_at,updated_at) VALUES ($1,$2,$3,'accounts-reclassified','investor',$4,$5::jsonb,now(),now())`,[randomUUID(),companyId,'codex:user-authorized-investment-remap',p.id,JSON.stringify({accountSelections:{before:p.accounts,after:mapping},changes,sourceNetCapital:sourceNet/100,sourceAmountsUnchanged:true,backup})]);
    assert.deepEqual(await fingerprints(),before);
    const check=(await db.query('SELECT id,account_id FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY id',[companyId,changes.map(c=>c.lineId)])).rows;
    assert.equal(check.length,changes.length);assert.ok(check.every(l=>l.account_id===mapping.capital));
    await db.query('COMMIT');
    await db.query('BEGIN READ ONLY');await db.query('SET LOCAL search_path TO public');
    assert.deepEqual(await fingerprints(),before);
    assert.deepEqual((await db.query('SELECT accounts FROM accountant_v2_investors WHERE company_id=$1 AND id=$2',[companyId,p.id])).rows[0].accounts,mapping);
    const published=(await db.query(`SELECT l.account_id,sum(CASE WHEN l.side='CREDIT' THEN l.amount ELSE -l.amount END)::text AS net FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id WHERE l.company_id=$1 AND l.journal_id=ANY($2::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY l.account_id`,[companyId,journalIds])).rows;
    assert.equal(cents(published.find(a=>a.account_id===mapping.capital)?.net),sourceNet);
    if(p.accounts.capital!==mapping.capital)assert.ok(!published.some(a=>a.account_id===p.accounts.capital));
    await db.query('COMMIT');
    report.applied=true;report.verified=true;report.unchangedTables=unchangedTables.length+1;
  }else await db.query('ROLLBACK');
  fs.writeFileSync(`${dir}/investment-remap-${apply?'verified':'preview'}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,changes:undefined},null,2));
}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();await pool.end();}
