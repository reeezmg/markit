import {z} from 'zod';
import {Router,badRequest} from './router';
import {context,accountantPrisma as prisma} from './context';
import {ensureDefaults} from './accounts';

export const userAccountingRouter=Router();
export const userAccountRoles:Record<string,{type:string;code:string}>={
  salaryExpense:{type:'EXPENSE',code:'5200'},salaryPayable:{type:'OTHER_CURRENT_LIABILITY',code:'2260'},
  receivable:{type:'ACCOUNTS_RECEIVABLE',code:'1100'},cash:{type:'CASH',code:'1001'},
  bank:{type:'BANK',code:''},opening:{type:'OTHER_CURRENT_LIABILITY',code:'2220'},
};
export async function userAccountingSettings(){
 const {db,companyId}=context();
 await ensureDefaults(companyId);
 await prisma.accountingAccount.createMany({data:[
  {name:'Salary Expense',code:'5200',accountType:'EXPENSE',category:'EXPENSE',isSystem:true},
  {name:'Salary Payable',code:'2260',accountType:'OTHER_CURRENT_LIABILITY',category:'LIABILITY',isSystem:true},
 ],skipDuplicates:true});
 const [settings]=await db.$queryRawUnsafe('SELECT * FROM accountant_v2_user_settings WHERE company_id=$1',companyId) as any[];
 const [erp]=await db.$queryRawUnsafe('SELECT accounts FROM accountant_v2_erp_settings WHERE company_id=$1',companyId) as any[];
 const accounts=await prisma.accountingAccount.findMany({where:{isActive:true},orderBy:{name:'asc'}});
 // Historical roles come from source documents; archived banks are never options.
 const historicalBanks=await db.$queryRawUnsafe(`SELECT bank_account_id AS id FROM salary_payments WHERE company_id=$1 AND bank_account_id IS NOT NULL
   UNION SELECT mt.account_id AS id FROM money_transactions mt JOIN user_ledger_entries l ON l.company_id=mt.company_id AND l.id=mt.id AND l.source_type='MANUAL'
   WHERE mt.company_id=$1 AND mt.account_id IS NOT NULL`,companyId) as any[];
 const mappings:Record<string,string>={...settings?.accounts};
 for(const [role,{type,code}] of Object.entries(userAccountRoles)){
  if(!mappings[role])mappings[role]=(['receivable','cash','bank'].includes(role)?erp?.accounts?.[role]:null)||accounts.find((a:any)=>code?a.code===code:a.accountType===type&&a.isPrimary)?.id||'';
 }
 const historicalBankRoles=[...new Set([...historicalBanks.map(b=>`bank:${b.id}`),...Object.keys(settings?.accounts||{}).filter(k=>k.startsWith('bank:'))])];
 return {enabled:!!settings?.enabled,mappings,accounts,banks:[],historicalBankRoles,activatedAt:settings?.activated_at};
}
export async function configureUserAccounting(mappings:Record<string,string>){
 const state=await userAccountingSettings();
 for(const role of Object.keys(userAccountRoles))if(!mappings[role])throw badRequest('Select an account for '+role);
 for(const [role,id] of Object.entries(mappings)){
  const type=role.startsWith('bank:')?'BANK':userAccountRoles[role]?.type;
  if(!id && role.startsWith('bank:'))continue;
  if(!type||!state.accounts.some((a:any)=>a.id===id&&a.accountType===type))throw badRequest('Invalid company account for '+role);
  if(role.startsWith('bank:')&&!state.historicalBankRoles.includes(role))throw badRequest('Unknown historical bank source role');
 }
 const {db,companyId}=context();
 await db.$executeRawUnsafe(`INSERT INTO accountant_v2_user_settings(company_id,accounts) VALUES($1,$2::jsonb) ON CONFLICT(company_id) DO UPDATE SET accounts=EXCLUDED.accounts`,companyId,JSON.stringify(mappings));
}
export async function enableUserAccounting(){
 const {db,companyId}=context();
 const state=await userAccountingSettings();await configureUserAccounting(state.mappings);
 if(!state.enabled){
  // Same lock order as salary writes: company first, then Accountant advisory lock.
  await db.$queryRawUnsafe('SELECT id FROM companies WHERE id=$1 FOR UPDATE',companyId);
  await db.$executeRawUnsafe(`INSERT INTO accountant_v2_user_sources(company_id,source_key,ledger_id,signature)
    SELECT company_id,accountant_v2_user_key(type::text,source_type::text,source_id,id),id,'{"excluded":true}'::jsonb||CASE WHEN type='CREDIT_BILL_PAYMENT' AND source_type='PAYROLL' THEN jsonb_build_object('baselineAmount',amount) ELSE '{}'::jsonb END FROM user_ledger_entries WHERE company_id=$1 ON CONFLICT DO NOTHING`,companyId);
  await db.$executeRawUnsafe('UPDATE accountant_v2_user_settings SET enabled=true,activated_at=now() WHERE company_id=$1',companyId);
 }
 return userAccountingSettings();
}
userAccountingRouter.get('/',async(_req,res)=>res.json(await userAccountingSettings()));
userAccountingRouter.put('/',async(req,res)=>{await configureUserAccounting(z.object({mappings:z.record(z.string())}).parse(req.body).mappings);res.json({success:true});});
userAccountingRouter.post('/enable',async(_req,res)=>res.json(await enableUserAccounting()));
