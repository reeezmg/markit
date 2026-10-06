import { z } from 'zod';
import { Router, asyncHandler, badRequest, notFound, requireAuth, rbac } from './router';
import { accountantPrisma as prisma, logActivity } from './context';
import { assertAccountingDateUnlocked, replaceSystemJournal, voidSystemJournal } from './posting';

export const accountTransferRouter = Router();
accountTransferRouter.use(requireAuth);

const schema = z.object({
  transferDate: z.string().min(1),
  fromAccountId: z.string().cuid(),
  toAccountId: z.string().cuid(),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3).default('INR'),
  exchangeRate: z.coerce.number().positive().default(1),
  referenceNumber: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional()
});
const eligibleTypes = ['CASH', 'BANK', 'PAYMENT_CLEARING_ACCOUNT', 'CREDIT_CARD'];

async function validateAccounts(companyId: string, fromAccountId: string, toAccountId: string) {
  if (fromAccountId === toAccountId) throw badRequest('From Account and To Account must be different');
  const accounts = await prisma.accountingAccount.findMany({
    where: { id: { in: [fromAccountId, toAccountId] }, companyId, isActive: true }
  });
  if (accounts.length !== 2) throw badRequest('Select two active accounts from this company');
  if (accounts.some(account => !eligibleTypes.includes(account.accountType))) {
    throw badRequest('Transfers support Cash, Bank, Credit Card, and Payment Clearing accounts');
  }
  return accounts;
}

async function postJournal(tx: any, transfer: any) {
  return replaceSystemJournal(tx, {
    companyId: transfer.companyId, sourceType: 'ACCOUNT_TRANSFER', sourceId: transfer.id,
    date: transfer.transferDate, reference: transfer.transferNumber,
    notes: transfer.description || `Account transfer ${transfer.transferNumber}`,
    currency: transfer.currency, exchangeRate: Number(transfer.exchangeRate),
    lines: [
      { accountId: transfer.toAccountId, side: 'DEBIT', amount: Number(transfer.amount), description: transfer.referenceNumber || undefined },
      { accountId: transfer.fromAccountId, side: 'CREDIT', amount: Number(transfer.amount), description: transfer.referenceNumber || undefined }
    ]
  });
}

async function enrich(rows: any[]) {
  const ids = [...new Set(rows.flatMap(row => [row.fromAccountId, row.toAccountId]))];
  const accounts = await prisma.accountingAccount.findMany({ where: { id: { in: ids } }, select: { id:true, name:true, code:true, accountType:true } });
  const map = new Map(accounts.map(account => [account.id, account]));
  const imports = await prisma.auditLog.findMany({where:{resource:'transfer-history-import',action:'imported'},select:{after:true}});
  const imported = new Set(imports.map((entry:any)=>entry.after?.transferId));
  return rows.map(row => ({ ...row, imported:imported.has(row.id), fromAccount: map.get(row.fromAccountId), toAccount: map.get(row.toAccountId) }));
}

accountTransferRouter.get('/', rbac('ACCOUNT', 'READ'), asyncHandler(async (req, res) => {
  const query = z.object({ search:z.string().trim().optional() }).parse(req.query);
  const rows = await prisma.accountTransfer.findMany({
    where: query.search ? { OR:[
      {transferNumber:{contains:query.search,mode:'insensitive'}},
      {referenceNumber:{contains:query.search,mode:'insensitive'}},
      {description:{contains:query.search,mode:'insensitive'}}
    ] } : {},
    orderBy:[{transferDate:'desc'},{createdAt:'desc'}]
  });
  res.json({ data: await enrich(rows) });
}));

accountTransferRouter.get('/next-number', rbac('ACCOUNT', 'READ'), asyncHandler(async (req, res) => {
  const count = await prisma.accountTransfer.count({ where:{companyId:req.user!.companyId!} });
  res.json({ transferNumber:`TRF-${String(count+1).padStart(5,'0')}` });
}));

accountTransferRouter.post('/', rbac('ACCOUNT', 'CREATE'), asyncHandler(async (req, res) => {
  const body = schema.parse(req.body), companyId = req.user!.companyId!;
  await validateAccounts(companyId, body.fromAccountId, body.toAccountId);
  const row = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account-transfer:${companyId}`}))`;
    const count = await tx.accountTransfer.count({where:{companyId}});
    const transfer = await tx.accountTransfer.create({data:{
      companyId, transferNumber:`TRF-${String(count+1).padStart(5,'0')}`,
      transferDate:new Date(body.transferDate), fromAccountId:body.fromAccountId,
      toAccountId:body.toAccountId, amount:body.amount, currency:body.currency,
      exchangeRate:body.exchangeRate, referenceNumber:body.referenceNumber||null,
      description:body.description||null
    }});
    await postJournal(tx, transfer);
    return transfer;
  });
  await logActivity({companyId,userId:req.user!.userId,action:'transferred funds',resource:'account-transfer',resourceId:row.id,meta:{transferNumber:row.transferNumber,amount:body.amount}});
  res.status(201).json((await enrich([row]))[0]);
}));

accountTransferRouter.patch('/:id', rbac('ACCOUNT', 'UPDATE'), asyncHandler(async (req, res) => {
  const id=String(req.params.id), body=schema.parse(req.body);
  const existing=await prisma.accountTransfer.findFirst({where:{id}});
  if(!existing) throw notFound('Account transfer');
  if(await prisma.auditLog.findFirst({where:{resource:'transfer-history-import',action:'imported',after:{path:['transferId'],equals:id}}})) throw badRequest('Imported transfers are preserved as history. Record a new correcting transfer.');
  await validateAccounts(existing.companyId,body.fromAccountId,body.toAccountId);
  const row=await prisma.$transaction(async tx=>{
    const transfer=await tx.accountTransfer.update({where:{id},data:{
      transferDate:new Date(body.transferDate),fromAccountId:body.fromAccountId,toAccountId:body.toAccountId,
      amount:body.amount,currency:body.currency,exchangeRate:body.exchangeRate,
      referenceNumber:body.referenceNumber||null,description:body.description||null
    }});
    await postJournal(tx,transfer); return transfer;
  });
  await logActivity({companyId:existing.companyId,userId:req.user!.userId,action:'edited',resource:'account-transfer',resourceId:id,meta:{transferNumber:existing.transferNumber}});
  res.json((await enrich([row]))[0]);
}));

accountTransferRouter.delete('/:id', rbac('ACCOUNT', 'DELETE'), asyncHandler(async (req,res)=>{
  const id=String(req.params.id),existing=await prisma.accountTransfer.findFirst({where:{id}});
  if(!existing) throw notFound('Account transfer');
  if(await prisma.auditLog.findFirst({where:{resource:'transfer-history-import',action:'imported',after:{path:['transferId'],equals:id}}})) throw badRequest('Imported transfers are preserved as history. Record a new correcting transfer.');
  await prisma.$transaction(async tx=>{
    await tx.accountTransfer.update({where:{id},data:{deletedAt:new Date()}});
    await voidSystemJournal(tx,existing.companyId,'ACCOUNT_TRANSFER',id);
  });
  await logActivity({companyId:existing.companyId,userId:req.user!.userId,action:'deleted',resource:'account-transfer',resourceId:id,meta:{transferNumber:existing.transferNumber}});
  res.json({ok:true});
}));
