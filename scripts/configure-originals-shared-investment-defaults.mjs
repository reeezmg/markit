import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { Pool } from 'pg';
dotenv.config({ quiet:true });
const companyId='6980e6e4-7d5d-413c-9554-24f385c9b853';
const dir='scripts/production-accounting/runs/originals-settings-selection-2026-10-06';
const apply=process.argv.includes('--apply');
const pool=new Pool({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,connectionTimeoutMillis:15000});
const db=await pool.connect();
try {
  await db.query(apply?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query('SET LOCAL search_path TO public');
  if(apply)await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`accountant-v2:${companyId}`]);
  const company=(await db.query('SELECT id,name,currency FROM companies WHERE id=$1',[companyId])).rows[0];
  assert.equal(company?.name,'ORIGINALS CLOTHING');
  const accounts=(await db.query('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1 ORDER BY id',[companyId])).rows;
  const investors=(await db.query('SELECT * FROM accountant_v2_investors WHERE company_id=$1 ORDER BY id',[companyId])).rows;
  const saved=(await db.query(`SELECT * FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='account-defaults' AND "resourceId"='investments' AND action='configured' AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1`,[companyId])).rows[0];
  const mappings={...(saved?.after||{})};
  const choices={}, additions=[];
  const specs=[
    ['capitalAccountId',"Owner's Equity",'3000','EQUITY','EQUITY'],
    ['profitAccountId','Investor Profit Payable','INV-PROFIT-PAYABLE','LIABILITY','OTHER_CURRENT_LIABILITY'],
    ['loanAccountId','Investor Loans Payable','INV-LOANS-PAYABLE','LIABILITY','OTHER_LIABILITY'],
  ];
  for(const [role,name,code,category,type] of specs){
    let account=accounts.find(a=>a.code===code);
    if(!account)account=accounts.find(a=>a.name===name&&a.account_type===type&&a.is_active&&!a.deleted_at);
    if(!account){
      if(role==='capitalAccountId')throw Error('Expected existing company equity account');
      account={id:randomUUID(),company_id:companyId,name,code,category,account_type:type,currency:company.currency||'INR',is_active:true,deleted_at:null};
      additions.push(account);
    }
    assert.ok(account.is_active&&!account.deleted_at&&account.category===category&&account.account_type===type,`Invalid ${role}`);
    assert.ok(!investors.some(i=>Object.values(i.accounts).includes(account.id)),`Company default ${name} is an investor-specific account`);
    mappings[role]=account.id;
    choices[role]={id:account.id,name:account.name,code:account.code,created:additions.includes(account)};
  }
  for(const role of ['counterAccountId','payoutAccountId']){
    const account=accounts.find(a=>a.id===mappings[role]);
    assert.ok(account&&account.is_active&&!account.deleted_at&&['CASH','BANK'].includes(account.account_type),`Invalid retained ${role}`);
  }
  const tables=(await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'accountant_v2_%' AND tablename NOT IN ('accountant_v2_accounting_accounts','accountant_v2_accountant_audit') ORDER BY tablename`)).rows.map(r=>r.tablename);
  async function fingerprint(){
    const hashes={};
    for(const table of tables){
      assert.match(table,/^[a-z_0-9]+$/);
      hashes[table]=(await db.query(`SELECT count(*)::int AS rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS hash FROM (SELECT md5(to_jsonb(t)::text) AS h FROM public.${table} t WHERE company_id=$1) x`,[companyId])).rows[0];
    }
    return hashes;
  }
  const financialBefore=await fingerprint();
  const report={at:new Date().toISOString(),company,dataOnly:true,schemaChanged:false,applied:false,choices,mappings,retainedInvestorAccounts:investors.map(i=>({id:i.id,name:i.name,accounts:i.accounts})),createdAccounts:[]};
  if(apply){
    const backup=`${dir}/shared-investment-backup-${new Date().toISOString().replaceAll(':','-')}.json`;
    fs.writeFileSync(backup,JSON.stringify({at:report.at,company,accounts,investors,previousDefault:saved,financialBefore},null,2),{flag:'wx'});
    report.backup=backup;
    for(const account of additions){
      await db.query(`INSERT INTO accountant_v2_accounting_accounts (id,company_id,name,code,category,account_type,currency,description,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())`,[account.id,companyId,account.name,account.code,account.category,account.account_type,account.currency,'Shared company investment account; journal rows retain investor attribution.']);
      report.createdAccounts.push(account.id);
    }
    const auditId=randomUUID();
    await db.query(`INSERT INTO accountant_v2_accountant_audit (id,company_id,"userId",action,resource,"resourceId","after",created_at,updated_at) VALUES ($1,$2,$3,'configured','account-defaults','investments',$4::jsonb,now(),now())`,[auditId,companyId,'codex:user-authorized-settings',JSON.stringify(mappings)]);
    report.auditId=auditId;
    assert.deepEqual(await fingerprint(),financialBefore,'Financial/source records must remain unchanged');
    const afterAccounts=(await db.query('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1 ORDER BY id',[companyId])).rows;
    assert.deepEqual(afterAccounts.filter(a=>!report.createdAccounts.includes(a.id)),accounts,'Existing chart accounts must remain unchanged');
    await db.query('COMMIT');
    // Independent post-commit read verifies persisted defaults and linked investor mappings.
    await db.query('BEGIN READ ONLY');
    await db.query('SET LOCAL search_path TO public');
    const verified=(await db.query(`SELECT "after" FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='account-defaults' AND "resourceId"='investments' AND action='configured' AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1`,[companyId])).rows[0].after;
    assert.deepEqual(verified,mappings);
    assert.deepEqual((await db.query('SELECT * FROM accountant_v2_investors WHERE company_id=$1 ORDER BY id',[companyId])).rows,investors);
    assert.deepEqual(await fingerprint(),financialBefore);
    for(const account of additions){
      const row=(await db.query('SELECT id FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND id=$2 AND is_active AND deleted_at IS NULL',[companyId,account.id])).rows[0];
      assert.ok(row);
      const lines=(await db.query('SELECT count(*)::int AS count FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND account_id=$2',[companyId,account.id])).rows[0].count;
      assert.equal(lines,0);
    }
    await db.query('COMMIT');
    report.applied=true;report.verified=true;report.financialTablesUnchanged=tables.length;
  }else await db.query('ROLLBACK');
  fs.writeFileSync(`${dir}/shared-investment-${apply?'verified':'preview'}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({applied:report.applied,verified:report.verified,company:company.name,choices,createdAccounts:report.createdAccounts,investorsRetained:investors.length,financialTablesUnchanged:report.financialTablesUnchanged},null,2));
}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
finally{db.release();await pool.end();}
