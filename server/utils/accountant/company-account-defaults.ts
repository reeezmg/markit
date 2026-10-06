import { randomBytes } from 'node:crypto';
import { coreAccountDefaults } from './accounts';
import { accountDefaultGroups, acceptsDefaultAccount } from '../../../utils/account-defaults';
import { erpRoles } from './erp';
import { userAccountRoles } from './users';
import { prismaSqlClient } from '../prisma-sql-client';

const extra = [
  ['Primary Bank','PRIMARY-BANK','BANK'],['Accrued Expenses','2250','OTHER_CURRENT_LIABILITY'],
  ['Salary Expense','5200','EXPENSE'],['Salary Payable','2260','OTHER_CURRENT_LIABILITY'],
  ['Investor Profit Payable','INV-PROFIT-PAYABLE','OTHER_CURRENT_LIABILITY'],
  ['Investor Loans Payable','INV-LOANS-PAYABLE','OTHER_LIABILITY'],
  ['Investor profit distributions','INV-DISTRIBUTION','EQUITY'],['Receive / Pay clearing','MONEY-CLEARING','EQUITY'],
  ['Fixed Assets','FA-ASSETS','FIXED_ASSET'],['Accumulated Depreciation','FA-ACCUM-DEP','FIXED_ASSET'],
  ['Depreciation Expense','FA-DEP-EXPENSE','EXPENSE'],['Asset Disposal Gain / Loss','FA-DISPOSAL','OTHER_EXPENSE'],
  ['COD held by couriers','EC-COD','PAYMENT_CLEARING_ACCOUNT'],['Online payments awaiting settlement','EC-GATEWAY','PAYMENT_CLEARING_ACCOUNT'],
  ['Delivery charges collected','EC-DELIVERY','INCOME'],['COD charges collected','EC-COD-INCOME','INCOME'],
  ['Customer refunds due','EC-REFUNDS','OTHER_CURRENT_LIABILITY'],['Courier and return shipping costs','EC-SHIPPING','EXPENSE'],
  ['Payment gateway fees','EC-GATEWAY-FEE','EXPENSE'],['Redeemed loyalty rewards','EC-LOYALTY','EXPENSE'],
] as const;
const category=(type:string)=>['INCOME','OTHER_INCOME'].includes(type)?'INCOME':['EXPENSE','OTHER_EXPENSE','COST_OF_GOODS_SOLD'].includes(type)?'EXPENSE':type==='EQUITY'?'EQUITY':['OTHER_CURRENT_LIABILITY','OTHER_LIABILITY','ACCOUNTS_PAYABLE'].includes(type)?'LIABILITY':'ASSET';
export const standardCompanyAccounts=[...coreAccountDefaults,...extra].map(([name,code,accountType])=>({name,code,accountType,category:category(accountType)}));
const onlineCodes:Record<string,string>={codClearing:'EC-COD',gatewayClearing:'EC-GATEWAY',deliveryIncome:'EC-DELIVERY',codIncome:'EC-COD-INCOME',refundPayable:'EC-REFUNDS',shippingExpense:'EC-SHIPPING',gatewayExpense:'EC-GATEWAY-FEE',loyaltyExpense:'EC-LOYALTY'};
const sameMap=(a:any,b:any)=>Object.keys(a||{}).length===Object.keys(b||{}).length&&Object.keys(a||{}).every(key=>a[key]===b?.[key]);

/** Data only. Caller owns the transaction, backup (for backfill), and company lock. */
export async function provisionCompanyAccountDefaults(sql:{query:(sql:string,args?:any[])=>Promise<any>},companyId:string,userId:string){
  const company=(await sql.query('SELECT id,currency,to_jsonb(c) AS details FROM companies c WHERE id=$1',[companyId])).rows[0];
  if(!company)throw Error('Company not found');
  let accounts=(await sql.query('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1 ORDER BY id',[companyId])).rows;
  const initialAccounts=accounts;
  const additions:any[]=[];
  const bank=accounts.find((a:any)=>a.account_type==='BANK'&&a.is_active&&!a.deleted_at&&a.is_primary)||accounts.find((a:any)=>a.name==='Primary Bank'&&a.account_type==='BANK'&&a.is_active&&!a.deleted_at);
  for(const spec of standardCompanyAccounts){
    if(spec.code==='PRIMARY-BANK'&&bank)continue;
    const found=accounts.find((a:any)=>a.code===spec.code);
    if(found){
      if(!found.is_active||found.deleted_at||found.account_type!==spec.accountType||found.category!==spec.category)throw Error(`Standard code ${spec.code} is inactive or has a different account type`);
      continue;
    }
    const details=company.details||{};
    additions.push({id:'c'+randomBytes(12).toString('hex'),...spec,...(spec.code==='PRIMARY-BANK'?{bankName:details.bank_name||null,accountNumber:details.account_no||null,routingNumber:details.ifsc||null,description:[details.acc_holder_name&&`Account holder: ${details.acc_holder_name}`,details.upi_id&&`UPI: ${details.upi_id}`].filter(Boolean).join('\n')||null}:{})});
  }
  if(additions.length)await sql.query(`INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,code,category,account_type,currency,is_system,is_primary,bank_name,account_number,routing_number,description,created_at,updated_at)
    SELECT x.id,$1,x.name,x.code,x.category::"AccountantAccountingAccountCategory",x."accountType"::"AccountantAccountingAccountType",$2,true,x.code='PRIMARY-BANK',x."bankName",x."accountNumber",x."routingNumber",x.description,now(),now()
    FROM jsonb_to_recordset($3::jsonb) AS x(id text,name text,code text,category text,"accountType" text,"bankName" text,"accountNumber" text,"routingNumber" text,description text)`,[companyId,company.currency||'INR',JSON.stringify(additions)]);
  accounts=(await sql.query('SELECT * FROM accountant_v2_accounting_accounts WHERE company_id=$1 ORDER BY id',[companyId])).rows;
  const live=(id:string)=>accounts.find((a:any)=>a.id===id&&a.is_active&&!a.deleted_at);
  const byCode=(code:string)=>accounts.find((a:any)=>a.code===code&&a.is_active&&!a.deleted_at)?.id;
  const bankId=bank?.id||byCode('PRIMARY-BANK');
  const byRole=(spec:{code?:string;type:string})=>spec.type==='BANK'?bankId:byCode(spec.code!);
  const changedSettings:string[]=[];
  const settings:Record<string,any>={};
  for(const [key,table,roles] of [['erp','accountant_v2_erp_settings',erpRoles],['staff','accountant_v2_user_settings',userAccountRoles]] as const){
    const previous=(await sql.query(`SELECT * FROM ${table} WHERE company_id=$1`,[companyId])).rows[0];
    const selected={...previous?.accounts};
    for(const [role,spec] of Object.entries(roles)){
      if(selected[role]){if(live(selected[role])?.account_type!==spec.type)throw Error(`Invalid existing ${key}/${role} selection`);}
      else selected[role]=byRole(spec);
    }
    if(!previous||!sameMap(selected,previous.accounts)){
      await sql.query(`INSERT INTO ${table}(company_id,accounts) VALUES($1,$2::jsonb) ON CONFLICT(company_id) DO UPDATE SET accounts=EXCLUDED.accounts`,[companyId,JSON.stringify(selected)]);
      changedSettings.push(key);
    }
    settings[key]=selected;
  }
  const defaults={
    purchase:{payable:byCode('2100'),stock:byCode('1200'),tax:byCode('1210'),cash:byCode('1001'),bank:bankId,opening:byCode('2220')},
    investments:{capitalAccountId:byCode('3000'),profitAccountId:byCode('INV-PROFIT-PAYABLE'),loanAccountId:byCode('INV-LOANS-PAYABLE'),counterAccountId:byCode('1001'),payoutAccountId:byCode('1001')},
    receive:{moneyAccountId:byCode('1001')},pay:{moneyAccountId:byCode('1001')},transfers:{fromAccountId:byCode('1001'),toAccountId:bankId},
    assets:{assetAccountId:byCode('FA-ASSETS'),accumulatedDepAccountId:byCode('FA-ACCUM-DEP'),depreciationExpenseAccountId:byCode('FA-DEP-EXPENSE'),proceedsAccountId:bankId,gainLossAccountId:byCode('FA-DISPOSAL')},
  };
  const audits=(await sql.query(`SELECT * FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource IN ('account-defaults','investor-profit-settings') AND action='configured' AND deleted_at IS NULL ORDER BY created_at DESC,id DESC`,[companyId])).rows;
  async function audit(resource:string,resourceId:string,after:any){await sql.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",resource,"resourceId",action,"after",created_at,updated_at) VALUES($1,$2,$3,$4,$5,'configured',$6::jsonb,now(),now())`,['c'+randomBytes(12).toString('hex'),companyId,userId,resource,resourceId,JSON.stringify(after)]);}
  for(const [key,fallback] of Object.entries(defaults)){
    const current=audits.find((a:any)=>a.resource==='account-defaults'&&a.resourceId===key)?.after||{};
    const selected:Record<string,string>={...fallback};
    for(const [role,id] of Object.entries(current) as [string,string][]){
      const field=accountDefaultGroups[key].fields[role];
      if(!field)continue; // Retired Purpose defaults are not carried forward.
      if(id){const account=live(id);if(!account||!acceptsDefaultAccount(field,{accountType:account.account_type}))throw Error(`Invalid existing ${key}/${role} default`);selected[role]=id;}
    }
    if(key==='transfers'&&selected.fromAccountId===selected.toAccountId)throw Error('Transfer endpoints must differ');
    if(!sameMap(selected,current)){await audit('account-defaults',key,selected);changedSettings.push(key);}
    settings[key]=selected;
  }
  const profit=audits.find((a:any)=>a.resource==='investor-profit-settings')?.after?.accountId||byCode('INV-DISTRIBUTION');
  if(live(profit)?.category!=='EQUITY')throw Error('Invalid existing profit distribution selection');
  const owned=(await sql.query(`SELECT id FROM accountant_v2_investors WHERE company_id=$1 AND (accounts->>'capital'=$2 OR accounts->>'profit'=$2 OR accounts->>'loan'=$2)`,[companyId,profit])).rows;
  if(owned.length)throw Error('Profit distribution account is used as an investor purpose account');
  if(!audits.some((a:any)=>a.resource==='investor-profit-settings')){await audit('investor-profit-settings',companyId,{accountId:profit});changedSettings.push('profitDistribution');}
  settings.profitDistribution=profit;
  const online=(await sql.query('SELECT * FROM accountant_v2_ecommerce_settings WHERE company_id=$1',[companyId])).rows[0];
  const onlineMap={...Object.fromEntries(Object.entries(settings.erp).filter(([key])=>key!=='expense')),...Object.fromEntries(Object.entries(onlineCodes).map(([role,code])=>[role,byCode(code)])),...online?.accounts};
  for(const [role,id] of Object.entries(onlineMap) as [string,string][]){
    const type=(erpRoles[role]||standardCompanyAccounts.find(s=>s.code===onlineCodes[role])&&{type:standardCompanyAccounts.find(s=>s.code===onlineCodes[role])!.accountType})?.type;
    if(type&&live(id)?.account_type!==type)throw Error(`Invalid existing online/${role} selection`);
  }
  if(!online||!sameMap(onlineMap,online.accounts)){await sql.query('INSERT INTO accountant_v2_ecommerce_settings(company_id,accounts) VALUES($1,$2::jsonb) ON CONFLICT(company_id) DO UPDATE SET accounts=EXCLUDED.accounts',[companyId,JSON.stringify(onlineMap)]);changedSettings.push('online');}
  settings.online=onlineMap;
  return {companyId,createdAccounts:additions.map(a=>({id:a.id,name:a.name,code:a.code})),changedSettings,settings,initialAccounts};
}
export async function initializeNewCompanyAccounts(tx:any,companyId:string,userId:string){
  const schema=new URL(process.env.DATABASE_URL!).searchParams.get('schema')||'public';
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw Error('Invalid accounting schema');
  await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
  return provisionCompanyAccountDefaults(prismaSqlClient(tx),companyId,userId);
}
