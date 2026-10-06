import { z } from 'zod';
import { Router, badRequest, requireAuth, rbac } from './router';
import { accountantPrisma as db, context, logActivity } from './context';
import { accountDefaultGroups, acceptsDefaultAccount } from '../../../utils/account-defaults';

export const accountSettingsRouter = Router();
accountSettingsRouter.use(requireAuth, rbac('ACCOUNT', 'WRITE'));
export async function accountDefaults() {
  const rows = await db.auditLog.findMany({ where: { resource: 'account-defaults', action: 'configured' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const defaults: Record<string, Record<string, string>> = {};
  for (const row of rows) if (!defaults[row.resourceId]) defaults[row.resourceId] = row.after || {};
  return defaults;
}
accountSettingsRouter.get('/defaults', async (_req, res) => res.json({ defaults: await accountDefaults() }));
accountSettingsRouter.get('/', async (_req, res) => {
  const accounts = await db.accountingAccount.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const suppliers = await db.$queryRawUnsafe(`SELECT d.id,d.name FROM distributors d JOIN distributor_companies dc ON dc.distributor_id=d.id WHERE dc.company_id=$1 ORDER BY d.name`, context().companyId);
  res.json({ defaults: await accountDefaults(), accounts, suppliers });
});
accountSettingsRouter.put('/:group', async (req, res) => {
  const group = accountDefaultGroups[req.params.group];
  if (!group) throw badRequest('Unknown account settings group');
  const { mappings } = z.object({ mappings: z.record(z.string()) }).parse(req.body);
  const selected = Object.fromEntries(Object.entries(mappings).filter(([, id]) => id));
  const accounts = await db.accountingAccount.findMany({ where: { id: { in: Object.values(selected) }, isActive: true } });
  for (const [key, id] of Object.entries(selected)) {
    const field = group.fields[key], account = accounts.find((a: any) => a.id === id);
    if (!field || !account || !acceptsDefaultAccount(field, account)) throw badRequest(`Select an active company account for ${field?.label || key}`);
  }
  if (req.params.group === 'transfers' && selected.fromAccountId && selected.fromAccountId === selected.toAccountId) throw badRequest('Transfer accounts must be different');
  await logActivity({ ...context(), action: 'configured', resource: 'account-defaults', resourceId: req.params.group, meta: selected });
  res.json({ success: true });
});
