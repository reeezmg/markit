import { accountantPrisma as prisma } from './context';
import { badRequest } from './router';
import { balancedTotal } from './posting';

/** Every overview and ledger reports company base currency; journals retain entered currency. */
export function baseAmount(line: any) {
  return Math.round(Number(line.amount) * Number(line.journal?.exchangeRate || 1) * 100) / 100;
}
export function validateExchange(lines: any[], rate: unknown) {
  const exchangeRate = Number(rate || 1);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw badRequest('Exchange rate must be positive');
  balancedTotal(lines.map(line => ({ ...line, amount: baseAmount({ ...line, journal: { exchangeRate } }) })));
}
export async function baseCurrencyTotals(args: any) {
  const lines = await prisma.manualJournalLine.findMany({ where: args.where, include: { journal: { select: { exchangeRate: true } } } });
  const groups = new Map<string, any>();
  for (const line of lines) {
    const key = args.by.map((field: string) => line[field]).join(':');
    const group = groups.get(key) || { ...Object.fromEntries(args.by.map((field: string) => [field, line[field]])), _sum: { amount: 0 } };
    group._sum.amount = Math.round((group._sum.amount + baseAmount(line)) * 100) / 100;
    groups.set(key, group);
  }
  return [...groups.values()];
}
