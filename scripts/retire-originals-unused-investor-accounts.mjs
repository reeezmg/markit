import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import dotenv from 'dotenv';
import {Pool} from 'pg';
dotenv.config({quiet:true});
const companyId='6980e6e4-7d5d-413c-9554-24f385c9b853';
const dir='scripts/production-accounting/runs/originals-settings-selection-2026-10-06';
const migration=JSON.parse(fs.readFileSync(`${dir}/investment-remap-verified.json`,'utf8'));
assert.equal(migration.company.id,companyId);assert.ok(migration.applied&&migration.verified);
const ids=Object.values(migration.beforeAccounts);
assert.equal(ids.length,3);
const apply=process.argv.includes('--apply');
const pool=new Pool({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,connectionTimeoutMillis:15000});
const db=await pool.connect();
try{
  await db.query(apply?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query('SET LOCAL search_path TO public');
  if(apply)await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`accountant-v2:${companyId}`]);
  const company=(await db.query('SELECT id,name FROM companies WHERE id=$1',[companyId])).rows[0];
  assert.equal(company.name,'ORIGINALS CLOTHING');
  const beforeAccounts=(await db.query('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1 ORDER BY id',[companyId])).rows;
  const obsolete=beforeAccounts.filter(a=>ids.includes(a.id));assert.equal(obsolete.length,3);
  assert.ok(obsolete.every(a=>a.name.includes(migration.investor.name)&&['EQUITY','OTHER_CURRENT_LIABILITY','OTHER_LIABILITY'].includes(a.account_type)));
  const tables=(await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'accountant_v2_%' AND tablename NOT IN ('accountant_v2_accounting_accounts','accountant_v2_accountant_audit') ORDER BY tablename`)).rows.map(r=>r.tablename);
  const references={};
  for(const table of tables){
    assert.match(table,/^[a-z_0-9]+$/);
    // Check structured and JSON references, including drafts and soft-deleted records.
    const count=(await db.query(`SELECT count(*)::int AS count FROM public.${table} t WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) target WHERE position(target in to_jsonb(t)::text)>0)`,[ids])).rows[0].count;
    if(count)references[table]=count;
  }
  const children=(await db.query('SELECT count(*)::int AS count FROM accountant_v2_accounting_accounts WHERE parent_id=ANY($1::text[])',[ids])).rows[0].count;
  assert.equal(children,0,'Obsolete accounts have sub-accounts');
  assert.deepEqual(references,{},'Obsolete accounts still have document or journal links');
  const investors=(await db.query('SELECT * FROM accountant_v2_investors WHERE company_id=$1 ORDER BY id',[companyId])).rows;
  assert.deepEqual(investors.find(i=>i.id===migration.investor.id)?.accounts,migration.afterAccounts);
  const activeDefaults=(await db.query(`SELECT DISTINCT ON ("resourceId") "resourceId","after" FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='account-defaults' AND action='configured' AND deleted_at IS NULL ORDER BY "resourceId",created_at DESC,id DESC`,[companyId])).rows;
  for(const row of activeDefaults)assert.ok(!Object.values(row.after||{}).some(id=>ids.includes(id)),'Obsolete account remains a current default');
  for(const id of Object.values(migration.afterAccounts))assert.ok(beforeAccounts.find(a=>a.id===id&&a.is_active&&!a.deleted_at),'Shared account must remain active');
  const sourceNet=Number((await db.query(`SELECT COALESCE(sum(CASE WHEN direction='IN' THEN amount ELSE -amount END),0)::text AS net FROM investments WHERE company_id=$1 AND "userId"=$2 AND status='COMPLETED'`,[companyId,investors.find(i=>i.id===migration.investor.id).legacy_user_id])).rows[0].net);
  const postedNet=Number((await db.query(`SELECT COALESCE(sum(CASE WHEN l.side='CREDIT' THEN l.amount ELSE -l.amount END),0)::text AS net FROM accountant_v2_investor_events e JOIN accountant_v2_manual_journals j ON j.id=e.journal_id AND j.company_id=e.company_id JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id WHERE e.company_id=$1 AND e.investor_id=$2 AND e.legacy_id IS NOT NULL AND l.account_id=$3 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL`,[companyId,migration.investor.id,migration.afterAccounts.capital])).rows[0].net);
  assert.equal(sourceNet,postedNet,'Shared capital must tally with investment sources');
  async function fingerprints(){
    const hashes={};
    for(const table of [...tables,'investments'])hashes[table]=(await db.query(`SELECT count(*)::int AS rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS hash FROM (SELECT md5(to_jsonb(t)::text) AS h FROM public.${table} t WHERE company_id=$1) x`,[companyId])).rows[0];
    return hashes;
  }
  const financialBefore=await fingerprints();
  const report={at:new Date().toISOString(),company,applied:false,schemaChanged:false,accounts:obsolete.map(a=>({id:a.id,name:a.name,alreadyRetired:!!a.deleted_at})),referenceCounts:references,sharedAccounts:migration.afterAccounts,sourceNetCapital:sourceNet,postedNetCapital:postedNet,difference:postedNet-sourceNet};
  if(apply){
    const backup=`${dir}/unused-investor-accounts-backup-${new Date().toISOString().replaceAll(':','-')}.json`;
    fs.writeFileSync(backup,JSON.stringify({at:report.at,company,obsolete,investors,activeDefaults,financialBefore},null,2),{flag:'wx'});
    report.backup=backup;
    const changed=obsolete.filter(a=>!a.deleted_at).map(a=>a.id);
    if(changed.length){
      const updated=await db.query('UPDATE accountant_v2_accounting_accounts SET is_active=false,deleted_at=now(),updated_at=now() WHERE company_id=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL',[companyId,changed]);
      assert.equal(updated.rowCount,changed.length);
      await db.query(`INSERT INTO accountant_v2_accountant_audit (id,company_id,"userId",action,resource,"resourceId","after",created_at,updated_at) VALUES ($1,$2,$3,'unused-accounts-retired','investor',$4,$5::jsonb,now(),now())`,[randomUUID(),companyId,'codex:user-authorized-investor-cleanup',migration.investor.id,JSON.stringify({accounts:obsolete,sharedAccounts:migration.afterAccounts,backup})]);
    }
    assert.deepEqual(await fingerprints(),financialBefore);
    const otherAccounts=(await db.query('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND NOT(id=ANY($2::text[])) ORDER BY id',[companyId,ids])).rows;
    assert.deepEqual(otherAccounts,beforeAccounts.filter(a=>!ids.includes(a.id)));
    await db.query('COMMIT');
    await db.query('BEGIN READ ONLY');await db.query('SET LOCAL search_path TO public');
    const after=(await db.query('SELECT id,is_active,deleted_at FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND id=ANY($2::text[])',[companyId,ids])).rows;
    assert.equal(after.length,3);assert.ok(after.every(a=>!a.is_active&&a.deleted_at));
    assert.deepEqual(await fingerprints(),financialBefore);
    assert.deepEqual((await db.query('SELECT * FROM accountant_v2_investors WHERE company_id=$1 ORDER BY id',[companyId])).rows,investors);
    await db.query('COMMIT');
    report.applied=true;report.verified=true;report.retired=changed.length;report.unchangedFinancialTables=Object.keys(financialBefore).length;
  }else await db.query('ROLLBACK');
  fs.writeFileSync(`${dir}/unused-investor-accounts-${apply?'verified':'preview'}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();await pool.end();}
