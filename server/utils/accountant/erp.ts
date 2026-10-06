import { z } from 'zod';
import { Router, badRequest } from './router';
import { context, accountantPrisma } from './context';
import { ensureDefaults } from './accounts';
import { selectErpStockAccount } from '../erp-stock-selection';
import { prismaSqlClient } from '../prisma-sql-client';
export const erpAccountingRouter=Router();
export const erpRoles:Record<string,{type:string;code?:string}>={
 cash:{type:'CASH',code:'1001'},bank:{type:'BANK'},receivable:{type:'ACCOUNTS_RECEIVABLE',code:'1100'},
 sales:{type:'INCOME',code:'4000'},outputTax:{type:'OTHER_CURRENT_LIABILITY',code:'2240'},
 stock:{type:'STOCK',code:'1200'},cogs:{type:'COST_OF_GOODS_SOLD',code:'5100'},
 expense:{type:'EXPENSE',code:'5000'},inputTax:{type:'OTHER_CURRENT_ASSET',code:'1210'},
 expensePayable:{type:'OTHER_CURRENT_LIABILITY',code:'2250'},
};
export async function erpAccountingSettings() {
 const {db,companyId}=context();
 await ensureDefaults(companyId);
 await accountantPrisma.accountingAccount.createMany({data:[{name:'Accrued Expenses',code:'2250',accountType:'OTHER_CURRENT_LIABILITY',category:'LIABILITY',isSystem:true}],skipDuplicates:true});
 const [settings]=await db.$queryRawUnsafe('SELECT * FROM accountant_v2_erp_settings WHERE company_id=$1',companyId) as {
   accounts: Record<string,string> | null;
   enabled: boolean;
   activated_at: Date | null;
 }[];
 const accounts=await accountantPrisma.accountingAccount.findMany({where:{isActive:true},orderBy:{name:'asc'}});
 const mappings={...settings?.accounts};
 for(const [role,spec] of Object.entries(erpRoles)) if(!mappings[role]) mappings[role]=accounts.find((a:any)=>spec.code?a.code===spec.code:a.accountType==='BANK'&&a.isPrimary)?.id || '';
 return {enabled:!!settings?.enabled,mappings,accounts,activatedAt:settings?.activated_at};
}
export async function configureErpAccounting(mappings:Record<string,string>) {
 const {db,companyId}=context();
 const state=await erpAccountingSettings();
 for(const [role,spec] of Object.entries(erpRoles)) if(!state.accounts.some((a:any)=>a.id===mappings[role]&&a.accountType===spec.type)) throw badRequest(`Select an active company account for ${role}`);
 await db.$executeRawUnsafe(`INSERT INTO accountant_v2_erp_settings(company_id,accounts) VALUES($1,$2::jsonb)
   ON CONFLICT(company_id) DO UPDATE SET accounts=EXCLUDED.accounts`,companyId,JSON.stringify(mappings));
 await selectErpStockAccount(prismaSqlClient(db),companyId,mappings.stock);
}
export async function enableErpAccounting() {
 const {db,companyId}=context();
 const state=await erpAccountingSettings();
 await configureErpAccounting(state.mappings);
 if(!state.enabled) {
   // Explicit baseline prevents later edits of old documents from importing history accidentally.
   await db.$executeRawUnsafe(`INSERT INTO accountant_v2_erp_sources(company_id,source_key,signature)
     SELECT company_id,'bill:'||id,'{"excluded":true}'::jsonb FROM bills WHERE company_id=$1
     UNION ALL SELECT company_id,'expense:'||id,'{"excluded":true}'::jsonb FROM expenses WHERE company_id=$1
     ON CONFLICT DO NOTHING`,companyId);
   await db.$executeRawUnsafe('UPDATE accountant_v2_erp_settings SET enabled=true,activated_at=now() WHERE company_id=$1',companyId);
 }
 return erpAccountingSettings();
}
erpAccountingRouter.get('/',async(_req,res)=>res.json(await erpAccountingSettings()));
erpAccountingRouter.put('/',async(req,res)=>{
 const body=z.object({mappings:z.record(z.string().min(1))}).parse(req.body);
 await configureErpAccounting(body.mappings);res.json({success:true});
});
erpAccountingRouter.post('/enable',async(_req,res)=>res.json(await enableErpAccounting()));

// Customer account is a source identity; receivable accounts may be shared.
erpAccountingRouter.get('/customers/:id',async(req,res)=>{
 const {db,companyId}=context();
 const customers=await db.$queryRawUnsafe('SELECT id,name FROM accounts WHERE company_id=$1 AND id=$2',companyId,req.params.id) as any[];
 if(!customers.length) throw badRequest('Customer account not found in this company');
 const rows=await db.$queryRawUnsafe(`SELECT j.id,j.entry_number,j.journal_date,j.reference_number,
   a.name AS account_name,l.side,round(l.amount*j.exchange_rate,2)::text AS amount
   FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
   JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
   WHERE j.company_id=$1 AND l.source_parties->'creditAccount'->>'id'=$2 AND a.account_type='ACCOUNTS_RECEIVABLE'
   AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL
   ORDER BY j.journal_date,j.created_at,j.id,l.id`,companyId,req.params.id) as any[];
 const due=rows.reduce((n:any,l:any)=>n+(l.side==='DEBIT'?1:-1)*Math.round(Number(l.amount)*100),0)/100;
 res.json({customer:customers[0],due,rows});
});
