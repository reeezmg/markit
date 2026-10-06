import fs from 'node:fs';
import dotenv from 'dotenv';
import { Pool } from 'pg';
dotenv.config({quiet:true});
const dir='scripts/production-accounting/runs/originals-settings-selection-2026-10-06';
const saved=JSON.parse(fs.readFileSync(`${dir}/settings-saved.json`,'utf8'));
const pool=new Pool({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,connectionTimeoutMillis:15000});
const db=await pool.connect();
try {
  await db.query('BEGIN READ ONLY');
  await db.query('SET LOCAL search_path TO public');
  const companyId=saved.company.id;
  const rows=(await db.query(`SELECT DISTINCT ON("resourceId") "resourceId" AS group,"after" AS mappings FROM accountant_v2_accountant_audit
    WHERE company_id=$1 AND resource='account-defaults' AND action='configured' AND deleted_at IS NULL ORDER BY "resourceId",created_at DESC,id DESC`,[companyId])).rows;
  const same=(a,b)=>!!a&&Object.keys(a).length===Object.keys(b).length&&Object.entries(b).every(([key,value])=>a[key]===value);
  for(const [group,mappings]of Object.entries(saved.proposedDefaults))if(!same(rows.find(r=>r.group===group)?.mappings,mappings))throw Error(`Verification failed: ${group}`);
  const online=(await db.query('SELECT enabled,accounts FROM accountant_v2_ecommerce_settings WHERE company_id=$1',[companyId])).rows[0];
  if(online.enabled||!same(online.accounts,saved.proposedOnline))throw Error('Online configuration mismatch');
  const profit=(await db.query(`SELECT "after" FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='investor-profit-settings' AND action='configured' AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1`,[companyId])).rows[0];
  if(profit?.after.accountId!==saved.profitAccountId)throw Error('Profit configuration mismatch');
  const accountIds=[...new Set([...Object.values(saved.proposedDefaults).flatMap(Object.values),...Object.values(saved.proposedOnline),saved.profitAccountId])];
  const accounts=(await db.query('SELECT id,name FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND id=ANY($2::text[]) AND is_active AND deleted_at IS NULL',[companyId,accountIds])).rows;
  if(accounts.length!==accountIds.length)throw Error('Selected account missing/inactive');
  const report={at:new Date().toISOString(),readOnly:true,verified:true,company:saved.company,defaultGroups:rows.length,selectedAccounts:accounts,onlinePostingEnabled:online.enabled,unresolved:saved.unresolved};
  fs.writeFileSync(`${dir}/settings-verified.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({verified:true,defaultGroups:rows.length,validSelectedAccounts:accounts.length,onlinePostingEnabled:online.enabled,unresolved:saved.unresolved.length}));
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
