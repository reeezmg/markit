import { createError } from 'h3';

/** Call inside the source transaction. The deferred posting reads this snapshot. */
export async function selectDistributorAccounts(db:any,companyId:string,distributorId:string,sourceKey:string,overrides:any) {
  const fail=(message:string)=>createError({statusCode:400,statusMessage:message});
  const configured=await db.query('SELECT enabled FROM accountant_v2_distributor_settings WHERE company_id=$1 AND distributor_id=$2',[companyId,distributorId]);
  if(!configured.rows[0]?.enabled) {
    if(overrides && Object.keys(overrides).length) throw fail('Connect this distributor to accounting before selecting transaction accounts');
    return;
  }
  await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:' || $1))",[companyId]);
  const recorded=await db.query('SELECT accounts FROM accountant_v2_distributor_sources WHERE company_id=$1 AND distributor_id=$2 AND source_key=$3',[companyId,distributorId,sourceKey]);
  if(!recorded.rows[0] || !Object.keys(recorded.rows[0].accounts||{}).length) {
    const saved=await db.query(`SELECT "after" FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='account-defaults' AND action='configured' AND "resourceId"='purchase' AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1`,[companyId]);
    overrides={...(saved.rows[0]?.after||{}),...overrides};
  }
  if(!overrides || !Object.keys(overrides).length) return;
  const types:Record<string,string[]>={payable:['ACCOUNTS_PAYABLE'],stock:['STOCK'],cash:['CASH'],bank:['BANK'],tax:['OTHER_CURRENT_ASSET'],opening:['EQUITY','OTHER_CURRENT_LIABILITY']};
  for(const [role,id] of Object.entries(overrides)) {
    const allowed=role.startsWith('bank:')?['BANK']:types[role];
    if(!allowed || typeof id!=='string') throw fail('Invalid accounting selection');
    const result=await db.query('SELECT 1 FROM accountant_v2_accounting_accounts WHERE id=$1 AND company_id=$2 AND is_active AND deleted_at IS NULL AND account_type::text=ANY($3::text[])',[id,companyId,allowed]);
    if(!result.rowCount) throw fail(`Choose an active company account for ${role}`);
  }
  const original=await db.query('SELECT accounts FROM accountant_v2_distributor_sources WHERE company_id=$1 AND distributor_id=$2 AND source_key=$3',[companyId,distributorId,sourceKey]);
  const defaults=await db.query('SELECT role,account_id FROM accountant_v2_distributor_mappings WHERE company_id=$1 AND distributor_id=$2',[companyId,distributorId]);
  const accounts={...Object.fromEntries(defaults.rows.map((m:any)=>[m.role,m.account_id])),...original.rows[0]?.accounts,...overrides};
  await db.query(`INSERT INTO accountant_v2_distributor_sources(company_id,distributor_id,source_key,signature,accounts)
    VALUES($1,$2,$3,'{}',$4::jsonb) ON CONFLICT(company_id,distributor_id,source_key) DO UPDATE
    SET accounts=EXCLUDED.accounts,signature=CASE WHEN accountant_v2_distributor_sources.accounts<>EXCLUDED.accounts THEN accountant_v2_distributor_sources.signature || '{"accountSelectionChanged":true}'::jsonb ELSE accountant_v2_distributor_sources.signature END`,[companyId,distributorId,sourceKey,JSON.stringify(accounts)]);
}
