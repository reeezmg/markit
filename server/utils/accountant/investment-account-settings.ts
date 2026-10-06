import { accountantPrisma as db, context } from './context';
import { badRequest } from './router';

export async function validateProfitDistributionAccount(id: string) {
  const account = await db.accountingAccount.findFirst({ where: { id, isActive: true, category: 'EQUITY' } });
  if (!account) throw badRequest('Select an active equity account in Investment settings');
  const owned = await db.$queryRawUnsafe(
    "SELECT id FROM accountant_v2_investors WHERE company_id=$1 AND (accounts->>'capital'=$2 OR accounts->>'profit'=$2 OR accounts->>'loan'=$2)",
    context().companyId, id
  );
  if (owned.length) throw badRequest('The distribution account cannot be an individual investor account');
  return account;
}
