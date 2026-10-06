import { createError } from 'h3';

/** Snapshot native payment accounts before deferred staff posting, in its source transaction. */
export async function selectStaffPaymentAccount(db:any, companyId:string, mode:string, bankId:string|null|undefined, ledgerId:string, historicalBankId?:string|null) {
  if (bankId && !['BANK','UPI'].includes(mode)) throw createError({statusCode:400,statusMessage:'A bank account requires a bank payment'});
  const cfg=(await db.query('SELECT enabled,accounts FROM accountant_v2_user_settings WHERE company_id=$1',[companyId])).rows[0];
  if(!cfg?.enabled) {
    if(bankId) throw createError({statusCode:400,statusMessage:'Connect staff accounting before selecting a payment account'});
    return;
  }
  await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[companyId]);
  const role=mode==='CASH'?'cash':'bank';
  const source=(await db.query('SELECT accounts FROM accountant_v2_user_sources WHERE company_id=$1 AND ledger_id=$2',[companyId,ledgerId])).rows[0];
  const historicalRole=role==='bank' && historicalBankId ? `bank:${historicalBankId}` : null;
  const chosen=bankId || (historicalRole
    ? source?.accounts?.[historicalRole] || cfg.accounts[historicalRole]
    : source?.accounts?.[role] || cfg.accounts[role]);
  const account=await db.query(`SELECT id FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND id=$2 AND is_active AND deleted_at IS NULL AND account_type::text=$3 FOR SHARE`,[companyId,chosen,role==='cash'?'CASH':'BANK']);
  if(!account.rowCount) throw createError({statusCode:403,statusMessage:'Choose an active payment account in this company'});
  await db.query(`INSERT INTO accountant_v2_user_sources(company_id,source_key,ledger_id,accounts)
    SELECT company_id,accountant_v2_user_key(type::text,source_type::text,source_id,id),id,$3::jsonb FROM user_ledger_entries WHERE company_id=$1 AND id=$2
    ON CONFLICT(company_id,source_key) DO UPDATE SET accounts=EXCLUDED.accounts`,[companyId,ledgerId,JSON.stringify({...cfg.accounts,...source?.accounts,[role]:chosen})]);
}
