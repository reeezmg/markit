import fs from 'node:fs';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {Pool} from 'pg';
import {provisionCompanyAccountDefaults} from '../server/utils/accountant/company-account-defaults';
dotenv.config({quiet:true});
const apply=process.argv.includes('--apply');
const dir='scripts/production-accounting/runs/all-company-defaults-2026-10-06';fs.mkdirSync(dir,{recursive:true});
const pool=new Pool({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,connectionTimeoutMillis:15000});
const db=await pool.connect();
const reports:any[]=[],blocked:any[]=[];
try{
  await db.query('BEGIN READ ONLY');await db.query('SET LOCAL search_path TO public');
  const only=process.argv.find(a=>a.startsWith('--company='))?.slice('--company='.length);
  const companies=(await db.query('SELECT id,name FROM companies ORDER BY id')).rows.filter(c=>!only||c.id===only);
  const tables=(await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'accountant_v2_%' AND tablename NOT IN ('accountant_v2_accounting_accounts','accountant_v2_accountant_audit','accountant_v2_erp_settings','accountant_v2_user_settings','accountant_v2_ecommerce_settings') ORDER BY tablename`)).rows.map(r=>r.tablename);
  await db.query('COMMIT');
  for(const table of tables)assert.match(table,/^[a-z_0-9]+$/);
  async function fingerprint(companyId:string){
    return (await db.query(tables.map(table=>`SELECT '${table}' AS name,count(*)::int AS rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS hash FROM (SELECT md5(to_jsonb(t)::text) AS h FROM public.${table} t WHERE company_id=$1) x`).join(' UNION ALL ')+' ORDER BY name',[companyId])).rows;
  }
  for(const company of companies){
    try{
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await db.query('SET LOCAL search_path TO public');
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`accountant-v2:${company.id}`]);
      const snapshot:any={company};
      for(const table of ['accountant_v2_accounting_accounts','accountant_v2_accountant_audit','accountant_v2_erp_settings','accountant_v2_user_settings','accountant_v2_ecommerce_settings'])snapshot[table]=(await db.query(`SELECT * FROM ${table} WHERE company_id=$1`,[company.id])).rows;
      const financialBefore=await fingerprint(company.id);snapshot.financialBefore=financialBefore;
      let backup='';
      if(apply){backup=`${dir}/backup-${company.id}-${Date.now()}.json`;fs.writeFileSync(backup,JSON.stringify(snapshot,null,2),{flag:'wx'});}
      const result=await provisionCompanyAccountDefaults(db,company.id,'codex:user-authorized-company-defaults');
      assert.deepEqual(await fingerprint(company.id),financialBefore,'Financial rows changed');
      const currentAccounts=(await db.query('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1 ORDER BY id',[company.id])).rows;
      assert.deepEqual(currentAccounts.filter(a=>!result.createdAccounts.some(c=>c.id===a.id)),result.initialAccounts,'Existing chart accounts changed');
      for(const table of ['accountant_v2_erp_settings','accountant_v2_user_settings','accountant_v2_ecommerce_settings']){
        const previous=snapshot[table][0];
        const current=(await db.query(`SELECT * FROM ${table} WHERE company_id=$1`,[company.id])).rows[0];
        if(previous){assert.equal(current.enabled,previous.enabled);assert.deepEqual(current.activated_at,previous.activated_at);}
        else assert.equal(current.enabled,false);
      }
      if(apply){
        const again=await provisionCompanyAccountDefaults(db,company.id,'codex:user-authorized-company-defaults');
        assert.equal(again.createdAccounts.length,0);assert.equal(again.changedSettings.length,0,'Provisioning must be idempotent');
        await db.query('COMMIT');
        await db.query('BEGIN READ ONLY');await db.query('SET LOCAL search_path TO public');
        assert.deepEqual(await fingerprint(company.id),financialBefore);
        const persisted=(await db.query('SELECT id FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND is_active AND deleted_at IS NULL',[company.id])).rows;
        for(const created of result.createdAccounts)assert.ok(persisted.some(a=>a.id===created.id));
        await db.query('COMMIT');
      }else await db.query('ROLLBACK');
      const row={company,applied:apply,verified:true,createdAccounts:result.createdAccounts,changedSettings:result.changedSettings,settings:result.settings,backup:backup||undefined};reports.push(row);
      if(company.name==='ORIGINALS CLOTHING')fs.writeFileSync(`${dir}/originals-account-review.json`,JSON.stringify({company,accounts:currentAccounts.filter(a=>a.is_active&&!a.deleted_at).map(a=>({name:a.name,code:a.code,type:a.account_type})),settings:result.settings},null,2));
      console.log(JSON.stringify({company:company.name,applied:apply,created:result.createdAccounts.length,settings:result.changedSettings.length}));
    }catch(error:any){await db.query('ROLLBACK').catch(()=>{});blocked.push({company,error:error.message});console.log(JSON.stringify({company:company.name,blocked:error.message}));}
    fs.writeFileSync(`${dir}/${apply?'verified':'preview'}${only?'-'+only:''}.json`,JSON.stringify({at:new Date().toISOString(),applied:apply,schemaChanged:false,total:companies.length,completed:reports.length,blocked,reports},null,2));
  }
  console.log(JSON.stringify({total:companies.length,completed:reports.length,blocked:blocked.length,applied:apply}));
  if(blocked.length)process.exitCode=1;
}finally{db.release();await pool.end();}
