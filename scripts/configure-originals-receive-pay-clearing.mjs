import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import dotenv from 'dotenv';
import {Pool} from 'pg';
dotenv.config({quiet:true});
const companyId='6980e6e4-7d5d-413c-9554-24f385c9b853';
const dir='scripts/production-accounting/runs/originals-settings-selection-2026-10-06';
const code='MONEY-CLEARING',name='Receive / Pay clearing';
const description='Shared balancing ledger for standalone Receive / Pay documents. Entries retain person links and references without settling other source documents.';
const apply=process.argv.includes('--apply');
const pool=new Pool({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,connectionTimeoutMillis:15000});
const db=await pool.connect();
try{
  await db.query(apply?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query('SET LOCAL search_path TO public');
  if(apply)await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`accountant-v2:${companyId}`]);
  const company=(await db.query('SELECT id,name,currency FROM companies WHERE id=$1',[companyId])).rows[0];
  assert.equal(company.name,'ORIGINALS CLOTHING');
  const beforeAccounts=(await db.query('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1 ORDER BY id',[companyId])).rows;
  const existing=beforeAccounts.filter(a=>a.code===code);
  assert.ok(existing.length<=1);
  const previous=existing[0]||null;
  if(previous){
    assert.ok(previous.is_active&&!previous.deleted_at&&previous.category==='EQUITY'&&previous.account_type==='EQUITY','Existing clearing ledger must be active and of the expected type');
    assert.ok(['Unclassified money',name].includes(previous.name),'Do not rename a custom ledger');
  }
  const id=previous?.id||randomUUID();
  const tables=(await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'accountant_v2_%' AND tablename NOT IN ('accountant_v2_accounting_accounts','accountant_v2_accountant_audit') ORDER BY tablename`)).rows.map(r=>r.tablename);
  async function fingerprint(){
    const hashes={};
    for(const table of [...tables,'money_transactions','investments']){
      assert.match(table,/^[a-z_0-9]+$/);
      hashes[table]=(await db.query(`SELECT count(*)::int AS rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS hash FROM (SELECT md5(to_jsonb(t)::text) AS h FROM public.${table} t WHERE company_id=$1) x`,[companyId])).rows[0];
    }
    return hashes;
  }
  const financialBefore=await fingerprint();
  const report={at:new Date().toISOString(),company,applied:false,schemaChanged:false,ledger:{id,code,name,category:'EQUITY',accountType:'EQUITY',currency:company.currency||'INR'},created:!previous,renamed:!!previous&&previous.name!==name};
  if(apply){
    const backup=`${dir}/receive-pay-clearing-backup-${new Date().toISOString().replaceAll(':','-')}.json`;
    fs.writeFileSync(backup,JSON.stringify({at:report.at,company,previous,financialBefore},null,2),{flag:'wx'});
    report.backup=backup;
    if(previous)await db.query('UPDATE accountant_v2_accounting_accounts SET name=$1,description=$2,updated_at=now() WHERE company_id=$3 AND id=$4',[name,description,companyId,id]);
    else await db.query(`INSERT INTO accountant_v2_accounting_accounts (id,company_id,category,account_type,name,code,currency,description,is_system,created_at,updated_at) VALUES ($1,$2,'EQUITY','EQUITY',$3,$4,$5,$6,true,now(),now())`,[id,companyId,name,code,company.currency||'INR',description]);
    await db.query(`INSERT INTO accountant_v2_accountant_audit (id,company_id,"userId",action,resource,"resourceId","after",created_at,updated_at) VALUES ($1,$2,$3,'balancing-ledger-configured','money',$4,$5::jsonb,now(),now())`,[randomUUID(),companyId,'codex:user-authorized-receive-pay-clearing',id,JSON.stringify({ledger:report.ledger,previousName:previous?.name||null,backup})]);
    assert.deepEqual(await fingerprint(),financialBefore,'Financial rows must remain unchanged');
    const others=(await db.query('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND id<>$2 ORDER BY id',[companyId,id])).rows;
    assert.deepEqual(others,beforeAccounts.filter(a=>a.id!==id),'Other accounts must remain unchanged');
    await db.query('COMMIT');
    await db.query('BEGIN READ ONLY');await db.query('SET LOCAL search_path TO public');
    const ledger=(await db.query('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND id=$2',[companyId,id])).rows[0];
    assert.ok(ledger&&ledger.is_active&&!ledger.deleted_at&&ledger.name===name&&ledger.code===code&&ledger.category==='EQUITY'&&ledger.account_type==='EQUITY');
    assert.deepEqual(await fingerprint(),financialBefore);
    await db.query('COMMIT');
    report.applied=true;report.verified=true;report.unchangedFinancialTables=Object.keys(financialBefore).length;
  }else await db.query('ROLLBACK');
  fs.writeFileSync(`${dir}/receive-pay-clearing-${apply?'verified':'preview'}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();await pool.end();}
