import { validateExchange } from './reporting';
import { z } from 'zod';
import { Router, asyncHandler, badRequest, notFound, requireAuth, rbac } from './router';
import { accountantPrisma as prisma, logActivity, context } from './context';
import { assertAccountingDateUnlocked, replaceSystemJournal, voidSystemJournal, balancedTotal, validatePosting, assertJournalApproval } from './posting';

export const manualJournalRouter = Router();
manualJournalRouter.use(requireAuth);

const lineSchema = z.object({
  accountId: z.string().cuid(),
  side: z.enum(['DEBIT', 'CREDIT']),
  amount: z.coerce.number().positive(),
  description: z.string().trim().max(500).nullable().optional(),
  partyId: z.string().cuid().nullable().optional(),
  projectId: z.string().cuid().nullable().optional()
});
const journalSchema = z.object({
  journalDate: z.string().min(1),
  referenceNumber: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().min(1).max(2000),
  currency: z.string().trim().length(3).default('INR'),
  exchangeRate: z.coerce.number().positive().default(1),
  journalType: z.enum(['BOTH', 'CASH', 'ACCRUAL']).default('BOTH'),
  reversalDate: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  lines: z.array(lineSchema).min(2)
});
const include = {
  lines: {
    where: { deletedAt: null },
    include: { account: { select: { id: true, name: true, code: true, accountType: true } } },
    orderBy: { createdAt: 'asc' as const }
  },
  reversedFrom: { select: { id: true, entryNumber: true } },
  reversals: { where: { deletedAt: null }, select: { id: true, entryNumber: true, journalDate: true } }
};

async function withStockSources(journals: any[]) {
  const ids = journals.filter(j => j.sourceType === 'STOCK_CONTROL').map(j => j.id);
  if (!ids.length) return journals;
  const audits = await prisma.auditLog.findMany({ where: { resource: 'stock-control', resourceId: { in: ids } }, orderBy: { createdAt: 'desc' } });
  return journals.map(j => ({ ...j, inventoryReconciliation: audits.find((a: any) => a.resourceId === j.id)?.after ?? null }));
}

function totals(lines: Array<{ side: string; amount: number }>) {
  const debit = lines.filter(line => line.side === 'DEBIT').reduce((sum, line) => sum + line.amount, 0);
  const credit = lines.filter(line => line.side === 'CREDIT').reduce((sum, line) => sum + line.amount, 0);
  return { debit, credit };
}

async function validateLines(lines: z.infer<typeof lineSchema>[], companyId: string) {
  balancedTotal(lines);
  const { debit, credit } = totals(lines);
  if (Math.abs(debit - credit) > 0.005) throw badRequest('Total debits must equal total credits');
  if (debit <= 0) throw badRequest('Journal total must be greater than zero');
  const ids = [...new Set(lines.map(line => line.accountId))];
  const accounts = await prisma.accountingAccount.findMany({ where: { id: { in: ids }, companyId, isActive: true } });
  if (accounts.length !== ids.length) throw badRequest('Every journal line must use an active account from this company');
  if (lines.some(line => line.partyId) && await prisma.party.count({ where: { id: { in: lines.map(line => line.partyId).filter(Boolean) as string[] }, companyId } }) !== new Set(lines.map(line => line.partyId).filter(Boolean)).size) {
    throw badRequest('Invalid contact selected');
  }
  if (lines.some(line => line.projectId) && await prisma.project.count({ where: { id: { in: lines.map(line => line.projectId).filter(Boolean) as string[] }, companyId } }) !== new Set(lines.map(line => line.projectId).filter(Boolean)).size) {
    throw badRequest('Invalid project selected');
  }
  return debit;
}

async function nextEntryNumber(companyId: string) {
  const count = await prisma.manualJournal.count({ where: { companyId } });
  return `MJ-${String(count + 1).padStart(5, '0')}`;
}

manualJournalRouter.get('/', rbac('ACCOUNT', 'READ'), asyncHandler(async (req, res) => {
  const query = z.object({
    search: z.string().trim().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    from: z.string().optional(),
    to: z.string().optional()
  }).parse(req.query);
  const data = await prisma.manualJournal.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to ? { journalDate: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {})
      } } : {}),
      ...(query.search ? { OR: [
        { entryNumber: { contains: query.search, mode: 'insensitive' } },
        { referenceNumber: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } }
      ] } : {})
    },
    include,
    orderBy: [{ journalDate: 'desc' }, { createdAt: 'desc' }]
  });
  res.json({ data: await withStockSources(data) });
}));

manualJournalRouter.get('/next-number', rbac('ACCOUNT', 'READ'), asyncHandler(async (req, res) => {
  res.json({ entryNumber: await nextEntryNumber(req.user!.companyId!) });
}));

manualJournalRouter.get('/source/:sourceType/:sourceId', rbac('ACCOUNT', 'READ'), asyncHandler(async (req, res) => {
  const data = await prisma.manualJournal.findMany({
    where: { sourceType: String(req.params.sourceType), sourceId: String(req.params.sourceId), isSystemGenerated: true },
    include,
    orderBy: { journalDate: 'asc' }
  });
  res.json({ data: await withStockSources(data) });
}));

manualJournalRouter.get('/:id', rbac('ACCOUNT', 'READ'), asyncHandler(async (req, res) => {
  const journal = await prisma.manualJournal.findFirst({ where: { id: String(req.params.id) }, include });
  if (!journal) throw notFound('Manual journal');
  res.json((await withStockSources([journal]))[0]);
}));

manualJournalRouter.post('/', rbac('ACCOUNT', 'CREATE'), asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId!;
  const body = journalSchema.parse(req.body);
  validateExchange(body.lines, body.exchangeRate);
  await assertAccountingDateUnlocked(companyId, new Date(body.journalDate));
  const total = await validateLines(body.lines, companyId);
  if (body.status === 'PUBLISHED') await assertJournalApproval(null);
  const journal = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`manual-journal:${companyId}`}))`;
    const entryNumber = `MJ-${String((await tx.manualJournal.count({ where: { companyId } })) + 1).padStart(5, '0')}`;
    return tx.manualJournal.create({
      data: {
        companyId, createdById: context().userId, entryNumber, journalDate: new Date(body.journalDate),
        referenceNumber: body.referenceNumber || null, notes: body.notes, currency: body.currency,
        exchangeRate: body.exchangeRate, journalType: body.journalType, status: body.status,
        total, reversalDate: body.reversalDate ? new Date(body.reversalDate) : null,
        publishedAt: body.status === 'PUBLISHED' ? new Date() : null,
        lines: { create: body.lines.map(line => ({ ...line, companyId, description: line.description || null })) }
      },
      include
    });
  });
  await logActivity({ companyId, userId: req.user!.userId, action: body.status === 'PUBLISHED' ? 'created and published' : 'created as draft', resource: 'manual-journal', resourceId: journal.id, meta: { entryNumber: journal.entryNumber, total } });
  res.status(201).json(journal);
}));

manualJournalRouter.patch('/:id', rbac('ACCOUNT', 'UPDATE'), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.manualJournal.findFirst({ where: { id } });
  if (!existing) throw notFound('Manual journal');
  if (existing.isSystemGenerated) throw badRequest('System-generated journals are managed by their source transaction');
  if (existing.status !== 'DRAFT' || existing.reversedFromId) throw badRequest('Only draft journals can be edited');
  await assertAccountingDateUnlocked(existing.companyId, existing.journalDate);
  const body = journalSchema.parse(req.body);
  validateExchange(body.lines, body.exchangeRate);
  await assertAccountingDateUnlocked(existing.companyId, new Date(body.journalDate));
  const total = await validateLines(body.lines, existing.companyId);
  if (body.status === 'PUBLISHED') await assertJournalApproval(null);
  const journal = await prisma.$transaction(async tx => {
    await tx.manualJournalLine.updateMany({ where: { journalId: id }, data: { deletedAt: new Date() } });
    return tx.manualJournal.update({
      where: { id },
      data: {
        approvals: [], journalDate: new Date(body.journalDate), referenceNumber: body.referenceNumber || null,
        notes: body.notes, currency: body.currency, exchangeRate: body.exchangeRate,
        journalType: body.journalType, status: body.status, total,
        reversalDate: body.reversalDate ? new Date(body.reversalDate) : null,
        publishedAt: body.status === 'PUBLISHED' ? new Date() : null,
        lines: { create: body.lines.map(line => ({ ...line, companyId: existing.companyId, description: line.description || null })) }
      },
      include
    });
  });
  await logActivity({ companyId: existing.companyId, userId: req.user!.userId, action: body.status === 'PUBLISHED' ? 'edited and published' : 'edited', resource: 'manual-journal', resourceId: id, meta: { entryNumber: existing.entryNumber, total } });
  res.json(journal);
}));

manualJournalRouter.post('/:id/publish', rbac('ACCOUNT', 'UPDATE'), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.manualJournal.findFirst({ where: { id } });
  if (!existing) throw notFound('Manual journal');
  if (existing.isSystemGenerated && !['RECURRING_JOURNAL', 'THIRTEENTH_MONTH'].includes(existing.sourceType)) throw badRequest('System-generated journals are managed by their source transaction');
  if (existing.status !== 'DRAFT') throw badRequest('Only draft journals can be published');
  await assertJournalApproval(existing);
  const lines = await prisma.manualJournalLine.findMany({ where: { journalId: id } });
  await validatePosting(lines, existing.journalDate);
  validateExchange(lines, existing.exchangeRate);
  await assertAccountingDateUnlocked(existing.companyId, existing.journalDate);
  const journal = await prisma.manualJournal.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() }, include });
  await logActivity({ companyId: existing.companyId, userId: req.user!.userId, action: 'published', resource: 'manual-journal', resourceId: id, meta: { entryNumber: existing.entryNumber } });
  res.json(journal);
}));

manualJournalRouter.post('/:id/reverse', rbac('ACCOUNT', 'CREATE'), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const body = z.object({ journalDate: z.string(), notes: z.string().trim().optional() }).parse(req.body);
  const original = await prisma.manualJournal.findFirst({ where: { id }, include });
  if (!original) throw notFound('Manual journal');
  if (original.isSystemGenerated) throw badRequest('System-generated journals cannot be reversed manually');
  if (original.status !== 'PUBLISHED') throw badRequest('Only published journals can be reversed');
  if (original.reversals.length) throw badRequest('This journal already has a reversal');
  const preference = await prisma.accountantPreference.findUnique({ where: { companyId: original.companyId } });
  const reversalStatus = preference?.journalApprovalType && preference.journalApprovalType !== "NONE" ? "DRAFT" : "PUBLISHED";
  await assertAccountingDateUnlocked(original.companyId, new Date(body.journalDate));
  const companyId = original.companyId;
  const journal = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`manual-journal:${companyId}`}))`;
    const entryNumber = `MJ-${String((await tx.manualJournal.count({ where: { companyId } })) + 1).padStart(5, '0')}`;
    return tx.manualJournal.create({
      data: {
        companyId, entryNumber, journalDate: new Date(body.journalDate),
        referenceNumber: original.referenceNumber, notes: body.notes || `Reversal of ${original.entryNumber}`,
        currency: original.currency, exchangeRate: original.exchangeRate, journalType: original.journalType,
        status: reversalStatus, createdById: context().userId, total: original.total, reversedFromId: original.id, publishedAt: reversalStatus === 'PUBLISHED' ? new Date() : null,
        lines: { create: original.lines.map(line => ({
          companyId, accountId: line.accountId, side: line.side === 'DEBIT' ? 'CREDIT' : 'DEBIT',
          amount: line.amount, description: line.description, partyId: line.partyId, projectId: line.projectId
        })) }
      },
      include
    });
  });
  await logActivity({ companyId, userId: req.user!.userId, action: 'reversed', resource: 'manual-journal', resourceId: original.id, meta: { entryNumber: original.entryNumber, reversalEntryNumber: journal.entryNumber } });
  res.status(201).json(journal);
}));

manualJournalRouter.delete('/:id', rbac('ACCOUNT', 'DELETE'), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.manualJournal.findFirst({ where: { id } });
  if (!existing) throw notFound('Manual journal');
  if (existing.isSystemGenerated) throw badRequest('System-generated journals are managed by their source transaction');
  if (existing.status !== 'DRAFT') throw badRequest('Only draft journals can be deleted');
  await assertAccountingDateUnlocked(existing.companyId, existing.journalDate);
  await prisma.manualJournal.update({ where: { id }, data: { deletedAt: new Date() } });
  await logActivity({ companyId: existing.companyId, userId: req.user!.userId, action: 'deleted', resource: 'manual-journal', resourceId: id, meta: { entryNumber: existing.entryNumber } });
  res.json({ ok: true });
}));

manualJournalRouter.post('/:id/approve', rbac('ACCOUNT', 'UPDATE'), asyncHandler(async (req, res) => {
  if (!['admin', 'manager'].includes(req.user.role)) throw badRequest('Approval requires an administrator or manager');
  const journal = await prisma.manualJournal.findFirst({ where: { id: req.params.id } });
  if (!journal || journal.status !== 'DRAFT') throw badRequest('Only draft journals can be approved');
  const preference = await prisma.accountantPreference.findUnique({ where: { companyId: req.user.companyId } });
  if (!preference?.allowSelfApproval && journal.createdById === req.user.userId) throw badRequest('Self approval is disabled');
  await assertAccountingDateUnlocked(req.user.companyId, journal.journalDate);
  await validatePosting(await prisma.manualJournalLine.findMany({ where: { journalId: journal.id } }), journal.journalDate);
  const approvals = (journal.approvals || []) as any[];
  if (approvals.some(a => a.userId === req.user.userId)) throw badRequest('You have already approved this journal');
  res.json(await prisma.manualJournal.update({ where: { id: journal.id }, data: {
    approvals: [...approvals, { userId: req.user.userId, date: new Date().toISOString() }],
  } }));
}));
