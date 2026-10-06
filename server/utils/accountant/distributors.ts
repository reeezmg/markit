import { z } from 'zod';
import { Router, badRequest, notFound } from './router';
import { accountantPrisma, context } from './context';
import { ensureDefaults } from './accounts';
import { selectDistributorAccounts } from '../distributor-account-selection';
import { prismaSqlClient } from '../prisma-sql-client';

export const distributorAccountingRouter = Router();
const roleTypes: Record<string, string[]> = {
  payable: ['ACCOUNTS_PAYABLE'], stock: ['STOCK'], cash: ['CASH'], bank: ['BANK'],
  tax: ['OTHER_CURRENT_ASSET'], opening: ['EQUITY', 'OTHER_CURRENT_LIABILITY'],
};
const query = <T = any>(sql: string, ...args: any[]): Promise<T[]> => context().db.$queryRawUnsafe(sql, ...args);
async function supplier(id: string) {
  const rows = await query(`SELECT d.id,d.name FROM distributors d JOIN distributor_companies dc ON dc.distributor_id=d.id
    WHERE dc.company_id=$1 AND d.id=$2`, context().companyId, id);
  if (!rows[0]) throw notFound('Company distributor');
  return rows[0];
}

export async function distributorAccountingPreview(id: string) {
  const { companyId } = context();
  const distributor = await supplier(id);
  await ensureDefaults(companyId);
  const [settings] = await query('SELECT * FROM accountant_v2_distributor_settings WHERE company_id=$1 AND distributor_id=$2',companyId,id);
  const mappings = await query('SELECT role,account_id FROM accountant_v2_distributor_mappings WHERE company_id=$1 AND distributor_id=$2',companyId,id);
  const accounts = await accountantPrisma.accountingAccount.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const events = await query(`SELECT * FROM accountant_v2_distributor_events WHERE company_id=$1 AND distributor_id=$2 ORDER BY event_date,source_key`,companyId,id);
  const [legacy] = await query(`SELECT COALESCE(opening_due,0)::numeric
    +COALESCE((SELECT sum(amount) FROM distributor_credits WHERE company_id=$1 AND distributor_id=$2),0)::numeric
    -COALESCE((SELECT sum(amount) FROM distributor_payments WHERE company_id=$1 AND distributor_id=$2),0)::numeric AS balance
    FROM distributor_companies WHERE company_id=$1 AND distributor_id=$2`,companyId,id);
  const sources = await query('SELECT source_key,journal_id,revision,accounts FROM accountant_v2_distributor_sources WHERE company_id=$1 AND distributor_id=$2',companyId,id);
  const ledger = await query(`SELECT j.id,j.entry_number,j.journal_date,j.reference_number,j.notes,
      a.name AS account,a.account_type::text AS account_type,l.side::text AS side,l.amount,l.account_id,j.source_type
    FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id
    JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id
    WHERE l.company_id=$1 AND l.distributor_id=$2 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL
    ORDER BY j.journal_date,j.created_at,j.id,l.side`,companyId,id);
  const expectedBalance = events.reduce((sum: number,e: any) => sum + Math.round(Number(e.amount)*100)*(e.kind==='PAYMENT'||e.kind==='RETURN'?-1:1),0)/100;
  const postedBalance = ledger.filter((l: any)=>l.account_type==='ACCOUNTS_PAYABLE').reduce((s: number,l: any)=>s+Math.round(Number(l.amount)*100)*(l.side==='CREDIT'?1:-1),0)/100;
  const recordedBankIds=new Set([...events.filter(e=>e.bank_id).map(e=>e.bank_id),...mappings.filter(m=>m.role.startsWith('bank:')).map(m=>m.role.slice(5))]);
  const banks=[...recordedBankIds].map(id=>({id,name:'Recorded bank source'}));
  const required = new Set(['payable','stock','cash','opening']);
  for (const e of events) {
    if (Number(e.tax)) required.add('tax');
    if (['PAYMENT','RECEIPT'].includes(e.kind) && e.mode!=='CASH') required.add(e.bank_id?`bank:${e.bank_id}`:'bank');
  }
  const errors = events.filter((e:any)=>!Number.isFinite(Number(e.amount)) || (Number(e.amount)<0&&e.kind!=='OPENING') || Number(e.tax)<0 || Number(e.tax)>Math.abs(Number(e.amount)))
    .map((e:any)=>`Invalid amount/tax in ${e.reference}`);
  const differences = await query(`SELECT p.purchase_order_no,round(sum(c.amount)::numeric,2) AS credited,p.total_amount,
      p.distributor_id<>c.distributor_id AS different_supplier
    FROM distributor_credits c JOIN purchase_orders p ON p.id=c.purchase_order_id AND p.company_id=c.company_id
    WHERE c.company_id=$1 AND c.distributor_id=$2 GROUP BY p.id,p.purchase_order_no,p.total_amount,p.distributor_id,c.distributor_id
    HAVING p.distributor_id<>c.distributor_id OR round(sum(c.amount)::numeric,2)<>round(p.total_amount::numeric,2)`,companyId,id);
  const warnings=differences.map((d:any)=>`PO-${d.purchase_order_no}: legacy credit ${d.credited}; purchase total ${d.total_amount}${d.different_supplier?'; distributor differs':''}. Imported using the legacy credit.`);
  const suggestedMappings=Object.fromEntries(mappings.map((m:any)=>[m.role,m.account_id]));
  if (!sources.some((source:any)=>source.source_key==='opening' && Object.keys(source.accounts || {}).length)) {
    const [saved]=await query(`SELECT "after" FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='account-defaults' AND action='configured' AND "resourceId"='purchase' AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1`,companyId);
    const opening=saved?.after?.opening;
    if (opening && accounts.some((a:any)=>a.id===opening && roleTypes.opening.includes(a.accountType))) suggestedMappings.opening=opening;
  }
  return { distributor, enabled: Boolean(settings?.enabled), mappings: suggestedMappings,
    accounts, banks, requiredRoles: [...required], events, sources, ledger, errors, warnings,
    legacyBalance: Number(legacy.balance), expectedBalance, postedBalance,
    legacyDifference: Math.round((expectedBalance-Number(legacy.balance))*100)/100,
    unpostedCount: events.filter((e:any)=>!sources.some((s:any)=>s.source_key===e.source_key)).length };
}

export async function configureDistributorAccounting(id: string, mappings: Record<string,string>) {
  const { companyId, db, userId } = context();
  const vendor = await supplier(id);
  const preview = await distributorAccountingPreview(id);
  // Keep legacy bank mappings internal; normal settings expose a single payment bank.
  mappings = { ...mappings };
  for (const [role, account] of Object.entries(preview.mappings)) {
    if (role.startsWith('bank:') && !mappings[role]) mappings[role] = account as string;
  }
  for (const role of preview.requiredRoles) {
    if (role.startsWith('bank:') && !mappings[role] && mappings.bank) mappings[role] = mappings.bank;
  }
  for (const role of preview.requiredRoles) if (!mappings[role]) throw badRequest(`Select an account for ${role}`);
  for (const [role, accountId] of Object.entries(mappings)) {
    const types = role.startsWith('bank:') ? ['BANK'] : roleTypes[role];
    if (!types || !preview.accounts.some((a:any)=>a.id===accountId && types.includes(a.accountType))) throw badRequest(`Invalid account for ${role}`);
    if (role.startsWith('bank:') && !preview.banks.some((b:any)=>role===`bank:${b.id}`)) throw badRequest('Bank does not belong to this company');
  }
  const [existing] = await query('SELECT contact_id FROM accountant_v2_distributor_settings WHERE company_id=$1 AND distributor_id=$2',companyId,id);
  const contactId = existing?.contact_id || (await accountantPrisma.party.create({data:{name:vendor.name,type:'VENDOR'}})).id;
  await db.$executeRawUnsafe(`INSERT INTO accountant_v2_distributor_settings(company_id,distributor_id,contact_id,updated_at)
    VALUES($1,$2,$3,now()) ON CONFLICT(company_id,distributor_id) DO UPDATE SET updated_at=now()`,companyId,id,contactId);
  await db.$executeRawUnsafe('DELETE FROM accountant_v2_distributor_mappings WHERE company_id=$1 AND distributor_id=$2',companyId,id);
  for (const [role,account] of Object.entries(mappings)) await db.$executeRawUnsafe(`INSERT INTO accountant_v2_distributor_mappings(company_id,distributor_id,role,account_id) VALUES($1,$2,$3,$4)`,companyId,id,role,account);
  await db.$executeRawUnsafe("SELECT set_config('app.accountant_user',$1,true)",userId);
  return { success:true };
}

export async function importDistributorAccounting(id: string) {
  const { companyId, db, userId } = context();
  const preview = await distributorAccountingPreview(id);
  if (preview.errors.length) throw badRequest(preview.errors.join('; '));
  await configureDistributorAccounting(id,preview.mappings);
  await db.$executeRawUnsafe('UPDATE accountant_v2_distributor_settings SET enabled=true,updated_at=now() WHERE company_id=$1 AND distributor_id=$2',companyId,id);
  // Existing opening balances are first posted when the supplier is enabled.
  await selectDistributorAccounts(prismaSqlClient(db),companyId,id,'opening',undefined);
  await db.$executeRawUnsafe("SELECT set_config('app.accountant_user',$1,true)",userId);
  const [result] = await query('SELECT accountant_v2_sync_distributor($1,$2) AS changed',companyId,id);
  const after = await distributorAccountingPreview(id);
  if (Math.abs(after.expectedBalance-after.postedBalance)>0.005) throw badRequest('Distributor reconciliation failed; import rolled back');
  return { changed:result.changed, ...after };
}

distributorAccountingRouter.get('/balances', async (_req,res)=> {
  const rows=await query(`SELECT s.distributor_id,
    COALESCE((SELECT sum(CASE WHEN l.side='CREDIT' THEN l.amount ELSE -l.amount END)
      FROM accountant_v2_manual_journal_lines l
      JOIN accountant_v2_manual_journals j ON j.id=l.journal_id
      JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id
      WHERE l.company_id=s.company_id AND l.distributor_id=s.distributor_id
        AND a.account_type='ACCOUNTS_PAYABLE' AND j.status='PUBLISHED'
        AND j.deleted_at IS NULL AND l.deleted_at IS NULL),0) AS balance
    FROM accountant_v2_distributor_settings s WHERE s.company_id=$1 AND s.enabled`,context().companyId);
  res.json(Object.fromEntries(rows.map((r:any)=>[r.distributor_id,Number(r.balance)])));
});
distributorAccountingRouter.get('/:id', async (req,res)=>res.json(await distributorAccountingPreview(req.params.id)));
distributorAccountingRouter.put('/:id', async (req,res)=> {
  const body=z.object({mappings:z.record(z.string().min(1))}).parse(req.body);
  res.json(await configureDistributorAccounting(req.params.id,body.mappings));
});
distributorAccountingRouter.post('/:id/import',async (req,res)=>res.json(await importDistributorAccounting(req.params.id)));
