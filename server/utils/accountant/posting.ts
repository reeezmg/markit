import { validateExchange } from './reporting';
import { accountantPrisma as prisma, context } from './context';
import { badRequest } from './router';

export function cents(value: unknown): number {
  const n = Number(value), result = Math.round(n * 100);
  if (!Number.isFinite(n) || !Number.isSafeInteger(result) || Math.abs(n * 100 - result) > 0.00001) {
    throw badRequest('Amounts must be finite, within range, and have at most two decimal places');
  }
  return result;
}
export function balancedTotal(lines: { side: string; amount: unknown }[]) {
  if (lines.length < 2) throw badRequest('A journal needs at least two lines');
  let debit = 0, credit = 0;
  for (const line of lines) {
    const amount = cents(line.amount);
    if (amount <= 0 || !['DEBIT', 'CREDIT'].includes(line.side)) throw badRequest('Every line needs a positive debit or credit');
    if (line.side === 'DEBIT') debit += amount; else credit += amount;
  }
  if (debit !== credit || !Number.isSafeInteger(debit)) throw badRequest('Total debits must equal total credits');
  return debit / 100;
}
export async function assertAccountingDateUnlocked(companyId: string, date: Date, module = 'ACCOUNTS') {
  if (!Number.isFinite(date.getTime())) throw badRequest('Invalid accounting date');
  const lock = await prisma.transactionLock.findFirst({ where: {
    companyId, isLocked: true, module: { in: ['ALL', module] }, lockDate: { gte: date },
  }, orderBy: { lockDate: 'desc' } });
  if (lock) throw badRequest(`Transactions are locked through ${lock.lockDate.toISOString().slice(0, 10)}: ${lock.reason}`);
}
export async function validatePosting(lines: any[], date: Date, companyId = context().companyId) {
  const total = balancedTotal(lines);
  await assertAccountingDateUnlocked(companyId, date);
  const ids = [...new Set(lines.map(line => line.accountId))];
  if (await prisma.accountingAccount.count({ where: { id: { in: ids }, isActive: true, deletedAt: null } }) !== ids.length) {
    throw badRequest('Every line must use an active account belonging to this company');
  }
  for (const [field, delegate] of [['partyId', 'party'], ['projectId', 'project']]) {
    const ids = [...new Set(lines.map(line => line[field]).filter(Boolean))];
    if (ids.length && await prisma[delegate].count({ where: { id: { in: ids }, deletedAt: null } }) !== ids.length) {
      throw badRequest('Contact or project does not belong to this company');
    }
  }
  return total;
}
export async function assertJournalApproval(journal: any) {
  const preference = await prisma.accountantPreference.findUnique({ where: { companyId: context().companyId } });
  const required = preference?.journalApprovalType === 'MULTI_LEVEL' ? 2 : preference?.journalApprovalType === 'SIMPLE' ? 1 : 0;
  const approvals = (journal?.approvals || []) as { userId: string }[];
  if (new Set(approvals.filter(a => preference?.allowSelfApproval || a.userId !== journal?.createdById).map(a => a.userId)).size < required) {
    throw badRequest(`Save a draft and collect ${required} distinct approval(s) before publishing`);
  }
}
export async function replaceSystemJournal(tx: any, input: any) {
  const total = await validatePosting(input.lines, input.date, input.companyId);
  validateExchange(input.lines, input.exchangeRate);
  if (input.sourceType === 'ACCOUNT_TRANSFER') await assertAccountingDateUnlocked(input.companyId, input.date, 'BANKING');
  const existing = await tx.manualJournal.findFirst({ where: { sourceType: input.sourceType, sourceId: input.sourceId } });
  if (existing) {
    await assertAccountingDateUnlocked(input.companyId, existing.journalDate);
    if (input.sourceType === 'ACCOUNT_TRANSFER') await assertAccountingDateUnlocked(input.companyId, existing.journalDate, 'BANKING');
    await tx.manualJournalLine.deleteMany({ where: { journalId: existing.id } });
  }
  const data = {
    journalDate: input.date, notes: input.notes, referenceNumber: input.reference || null,
    currency: input.currency || 'INR', exchangeRate: input.exchangeRate || 1,
    journalType: input.journalType || 'BOTH', total, status: input.status || 'PUBLISHED',
    publishedAt: input.status === 'DRAFT' ? null : new Date(), isSystemGenerated: true,
    createdById: context().userId,
    lines: { create: input.lines.map((line: any) => ({ ...line, companyId: input.companyId })) },
  };
  if (existing) return tx.manualJournal.update({ where: { id: existing.id }, data });
  return tx.manualJournal.create({ data: {
    ...data, companyId: input.companyId, sourceType: input.sourceType, sourceId: input.sourceId,
    entryNumber: `SYS-${String(await tx.manualJournal.count({}) + 1).padStart(6, '0')}`,
  } });
}
export async function voidSystemJournal(tx: any, companyId: string, sourceType: string, sourceId: string) {
  const existing = await tx.manualJournal.findFirst({ where: { sourceType, sourceId } });
  if (!existing) return;
  await assertAccountingDateUnlocked(companyId, existing.journalDate);
  if (sourceType === 'ACCOUNT_TRANSFER') await assertAccountingDateUnlocked(companyId, existing.journalDate, 'BANKING');
  await tx.manualJournal.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
}
