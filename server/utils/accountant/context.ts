import { AsyncLocalStorage } from 'node:async_hooks';
import { prisma as database } from '../../prisma';
import { badRequest } from './router';

export type AccountantContext = { companyId: string; userId: string; role: string; db: any };
export const accountantContext = new AsyncLocalStorage<AccountantContext>();
export function context() {
  const value = accountantContext.getStore();
  if (!value) throw new Error('Accountant database access requires an authenticated request context');
  return value;
}
export const modelMap = {
  accountingAccount: 'accountantAccountingAccount', manualJournal: 'accountantManualJournal',
  manualJournalLine: 'accountantManualJournalLine', journalTemplate: 'accountantJournalTemplate',
  recurringJournalProfile: 'accountantRecurringJournalProfile', accountingBudget: 'accountantAccountingBudget',
  transactionLock: 'accountantTransactionLock', accountOpeningBalance: 'accountantAccountOpeningBalance',
  fixedAssetCategory: 'accountantFixedAssetCategory', fixedAsset: 'accountantFixedAsset',
  assetDepreciation: 'accountantAssetDepreciation', assetDisposal: 'accountantAssetDisposal',
  currencyAdjustment: 'accountantCurrencyAdjustment', accountantPreference: 'accountantPreference',
  accountantClient: 'accountantClient', accountTransfer: 'accountantAccountTransfer',
  party: 'accountantContact', project: 'accountantProject', auditLog: 'accountantAudit',
} as const;

const reads = new Set(['findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow', 'aggregate', 'groupBy']);
/** Count includes deleted rows so soft deletion cannot reuse document numbers. */
export function scopeArgs(operation: string, args: any, companyId: string) {
  const value = { ...args };
  if (reads.has(operation) || ['count', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation)) {
    value.where = { ...value.where, companyId, ...(reads.has(operation) ? { deletedAt: null } : {}) };
  }
  const stamp = (data: any) => ({ ...data, companyId });
  if (operation === 'create') value.data = stamp(value.data);
  if (operation === 'createMany') value.data = Array.isArray(value.data) ? value.data.map(stamp) : stamp(value.data);
  if (operation === 'upsert') value.create = stamp(value.create);
  if (['update', 'updateMany', 'upsert'].includes(operation)) {
    const data = operation === 'upsert' ? value.update : value.data;
    if (data && ('companyId' in data || 'company' in data)) throw badRequest('Accounting records cannot move between companies');
  }
  return value;
}

// All delegates resolve the request-local transaction. Concurrent requests never share company state.
export const accountantPrisma: any = new Proxy({}, {
  get(_target, property: string) {
    if (property === '$transaction') return async (fn: any) => {
      if (typeof fn !== 'function') throw new Error('Use interactive Accountant transactions');
      return fn(accountantPrisma); // The API wraps the entire mutation, including validation and audit, in one transaction.
    };
    if (property.startsWith('$')) return (...args: any[]) => context().db[property](...args);
    if (property === 'company') return {
      async findUnique() {
        const { companyId, db } = context();
        const [company, preference] = await Promise.all([
          db.company.findUnique({ where: { id: companyId }, select: { currency: true } }),
          db.accountantPreference.findUnique({ where: { companyId } }),
        ]);
        return { currency: company?.currency || 'INR', fyStartMonth: preference?.fyStartMonth || 4 };
      },
    };
    const name = modelMap[property as keyof typeof modelMap];
    if (!name) throw new Error(`Unsupported Accountant model: ${property}`);
    return new Proxy({}, { get(_delegate, operation: string) {
      if (operation === 'findFirstIncludingDeleted') return (args: any = {}) => context().db[name].findFirst(scopeArgs('count', args, context().companyId));
      return (args: any = {}) => context().db[name][operation](scopeArgs(operation, args, context().companyId));
    } });
  },
});
export async function logActivity(input: { companyId: string; userId: string; action: string; resource: string; resourceId: string; meta?: any }) {
  // Request identities also contain authorization fields such as role; only persist audit columns.
  const { companyId, userId, action, resource, resourceId, meta } = input;
  return accountantPrisma.auditLog.create({ data: { companyId, userId, action, resource, resourceId, after: meta || {} } });
}
export async function runAccountant<T>(identity: Omit<AccountantContext, 'db'>, fn: () => Promise<T>, options: { lockCompany?: boolean; transactionTimeoutMs?: number } = {}) {
  return database.$transaction(async db => {
    // Raw integration queries and SQL functions must use the same schema as Prisma,
    // including behind a connection pool whose sessions may have another search_path.
    const schema = new URL(process.env.DATABASE_URL!).searchParams.get('schema') || 'public';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw new Error('Invalid accounting schema');
    await db.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    if (options.lockCompany) await db.$queryRawUnsafe('SELECT id FROM companies WHERE id=$1 FOR UPDATE', identity.companyId);
    // One ordering for all company accounting mutations prevents numbering, reversal, lock and asset races.
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`accountant-v2:${identity.companyId}`}))`;
    return accountantContext.run({ ...identity, db }, fn);
  }, { maxWait: 15000, timeout: options.transactionTimeoutMs ?? 30000 });
}
