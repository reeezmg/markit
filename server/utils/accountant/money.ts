import { z } from 'zod';
import { accountantPrisma as db, context, logActivity } from './context';
import { Router, requireAuth, rbac, badRequest, notFound } from './router';
import { ensureDefaults } from './accounts';
import { assertAccountingDateUnlocked, validatePosting } from './posting';

export const moneyRouter = Router();
moneyRouter.use(requireAuth, rbac('ACCOUNT', 'WRITE'));
const sources = ['MONEY_RECEIVE', 'MONEY_PAY', 'LEGACY_MONEY_RECEIVE', 'LEGACY_MONEY_PAY'];
async function moneyScope() {
 const imports=await db.auditLog.findMany({where:{resource:'transaction-history-import',action:'imported'}});
 return {OR:[{sourceType:{in:sources}},{id:{in:imports.map((a:any)=>a.after?.journalId).filter(Boolean)}}]};
}
const include = { lines: { include: { account: { select: { name: true, accountType: true } } } }, reversals: { select: { id: true, entryNumber: true } } };
const schema = z.object({
  requestId: z.string().uuid(), direction: z.enum(['RECEIVE', 'PAY']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  moneyAccountId: z.string().cuid(), purposeAccountId: z.string().cuid(),
  amount: z.coerce.number().positive(), reference: z.string().trim().max(100).default(''),
  note: z.string().trim().max(1000).default(''),
  party: z.object({ kind: z.enum(['client', 'user', 'distributor', 'contact']), id: z.string().min(1) }).nullable().default(null),
});
async function people() {
  const c = context().companyId;
  return db.$queryRawUnsafe(`SELECT cl.id,cl.name,'client' AS kind FROM clients cl JOIN company_clients cc ON cc.client_id=cl.id WHERE cc.company_id=$1
    UNION ALL SELECT user_id AS id,COALESCE(name,user_id) AS name,'user' AS kind FROM company_users WHERE company_id=$1 AND NOT deleted
    UNION ALL SELECT d.id,d.name,'distributor' AS kind FROM distributors d JOIN distributor_companies dc ON dc.distributor_id=d.id WHERE dc.company_id=$1
    UNION ALL SELECT id,name,'contact' AS kind FROM accountant_v2_accountant_contact WHERE company_id=$1 AND deleted_at IS NULL
    ORDER BY name`, c);
}
moneyRouter.get('/options', async (_req, res) => {
  await ensureDefaults(context().companyId);
  res.json({ accounts: await db.accountingAccount.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    people: await people(), currency: (await db.company.findUnique()).currency });
});
moneyRouter.get('/', async (req, res) => {
  const { page, search } = z.object({page:z.coerce.number().int().min(1).default(1),search:z.string().trim().max(100).default('')}).parse(req.query);
  const where = { AND: [await moneyScope(), ...(search ? [{ OR: ['entryNumber','referenceNumber','notes'].map(key => ({[key]:{contains:search,mode:'insensitive'}})) }] : [])] };
  res.json({ data: await db.manualJournal.findMany({where,include,orderBy:[{journalDate:'desc'},{createdAt:'desc'}],skip:(page-1)*20,take:20}),
    total: await db.manualJournal.count({where:{...where,deletedAt:null}}) });
});
moneyRouter.post('/', async (req, res) => {
  const b = schema.parse(req.body), c = context().companyId;
  const date = new Date(b.date+'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==b.date) throw badRequest('Select a valid date');
  if (b.moneyAccountId===b.purposeAccountId) throw badRequest('Choose different money and purpose accounts');
  const accounts = await db.accountingAccount.findMany({where:{id:{in:[b.moneyAccountId,b.purposeAccountId]},isActive:true}});
  const money = accounts.find((a:any)=>a.id===b.moneyAccountId), purpose=accounts.find((a:any)=>a.id===b.purposeAccountId);
  if (!money || !purpose) throw badRequest('Choose active accounts belonging to this company');
  if (!['CASH','BANK'].includes(money.accountType)) throw badRequest('Select a cash or bank account');
  if (['CASH','BANK'].includes(purpose.accountType)) throw badRequest('Use Transfers to move money between cash and bank accounts');
  if (['ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE'].includes(purpose.accountType) && !b.party) throw badRequest('Select the person this outstanding amount belongs to');
  const person=b.party ? (await people()).find((p:any)=>p.kind===b.party!.kind && p.id===b.party!.id) : null;
  if (b.party && !person) throw badRequest('Selected person does not belong to this company');
  const dimensions:any = person ? person.kind==='distributor' ? {distributorId:person.id} : person.kind==='contact' ? {partyId:person.id} : {sourceParties:{[person.kind]:{id:person.id,name:person.name}}} : {};
  const lines=[{accountId:money.id,side:b.direction==='RECEIVE'?'DEBIT':'CREDIT',amount:b.amount,...dimensions},
    {accountId:purpose.id,side:b.direction==='RECEIVE'?'CREDIT':'DEBIT',amount:b.amount,...dimensions}];
  // Persist a canonical request for safe retries, including after a lost response.
  const canonical=JSON.stringify(b);
  const existing=await db.manualJournal.findFirst({where:{sourceType:{in:sources},sourceId:b.requestId},include});
  if(existing){
    const audit=await db.auditLog.findFirst({where:{resource:'money-entry',resourceId:existing.id,action:'created'}});
    if(audit?.after?.request!==canonical) throw badRequest('This request was already used for another entry');
    res.json(existing);return;
  }
  await validatePosting(lines,date,c);
  await assertAccountingDateUnlocked(c,date,'BANKING');
  const prefix=b.direction==='RECEIVE'?'RCV':'PAY';
  const journal=await db.manualJournal.create({data:{companyId:c,entryNumber:`${prefix}-${String(await db.manualJournal.count({})+1).padStart(6,'0')}`,
    journalDate:date,referenceNumber:b.reference||null,notes:b.note || (b.direction==='RECEIVE'?'Money received':'Money paid'),currency:(await db.company.findUnique()).currency,
    total:b.amount,status:'PUBLISHED',publishedAt:new Date(),createdById:context().userId,isSystemGenerated:true,
    sourceType:`MONEY_${b.direction}`,sourceId:b.requestId,lines:{create:lines.map(line=>({...line,companyId:c,description:person?`${person.kind}: ${person.name}`:null}))}},include});
  await logActivity({companyId:c,userId:context().userId,action:'created',resource:'money-entry',resourceId:journal.id,meta:{request:canonical}});
  res.status(201).json(journal);
});
moneyRouter.post('/:id/reverse', async (req,res)=>{
  const {date:rawDate}=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(req.body);
  const date=new Date(rawDate+'T00:00:00.000Z'), c=context().companyId;
  if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==rawDate) throw badRequest('Select a valid reversal date');
  const original=await db.manualJournal.findFirst({where:{id:req.params.id,...await moneyScope()},include});
  if(!original) throw notFound('Money entry');
  if(original.reversals.length){res.json(original.reversals[0]);return;}
  if(date<original.journalDate) throw badRequest('Reversal cannot be before the original entry');
  await assertAccountingDateUnlocked(c,original.journalDate);
  await assertAccountingDateUnlocked(c,original.journalDate,'BANKING');
  await assertAccountingDateUnlocked(c,date);await assertAccountingDateUnlocked(c,date,'BANKING');
  const reversal=await db.manualJournal.create({data:{companyId:c,entryNumber:`REV-${String(await db.manualJournal.count({})+1).padStart(6,'0')}`,
    journalDate:date,currency:original.currency,total:original.total,status:'PUBLISHED',publishedAt:new Date(),createdById:context().userId,
    isSystemGenerated:true,sourceType:'MONEY_REVERSAL',sourceId:original.id,reversedFromId:original.id,notes:`Reversal of ${original.entryNumber}`,
    lines:{create:original.lines.map((l:any)=>({companyId:c,accountId:l.accountId,side:l.side==='DEBIT'?'CREDIT':'DEBIT',amount:l.amount,
      description:l.description,distributorId:l.distributorId,partyId:l.partyId,...(l.sourceParties?{sourceParties:l.sourceParties}:{})}))}}});
  await logActivity({companyId:c,userId:context().userId,action:'reversed',resource:'money-entry',resourceId:original.id,meta:{journalId:reversal.id}});
  res.json(reversal);
});
