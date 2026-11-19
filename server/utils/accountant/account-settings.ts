import { z } from 'zod';
import { Router, badRequest, requireAuth, rbac } from './router';
import { accountantPrisma as db, context, logActivity } from './context';
import { accountDefaultGroups, acceptsDefaultAccount } from '../../../utils/account-defaults';
import { validateProfitDistributionAccount } from './investment-account-settings';
import { investmentDefaultAccounts, investmentDefaultCodes } from '../../../utils/investment-default-accounts';

export const accountSettingsRouter = Router();
accountSettingsRouter.use(requireAuth, rbac('ACCOUNT', 'WRITE'));
export async function accountDefaults() {
  const rows = await db.auditLog.findMany({ where: { resource: 'account-defaults', action: 'configured' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const defaults: Record<string, Record<string, string>> = {};
  for (const row of rows) if (!defaults[row.resourceId]) defaults[row.resourceId] = row.after || {};
  return defaults;
}
accountSettingsRouter.get('/defaults', async (_req, res) => res.json({ defaults: await accountDefaults() }));
/** Mutation only: runs inside the accounting transaction and company lock. */
export async function ensureInvestmentAccountDefaults() {
  const defaults = await accountDefaults();
  const currency = (await db.company.findUnique()).currency;
  const accounts = await db.accountingAccount.findMany({ where: { isActive: true } });
  for (const [group, codes] of Object.entries(investmentDefaultCodes)) {
    const previous = defaults[group] || {}, selected = { ...previous };
    for (const [field, code] of Object.entries(codes)) {
      const rule = accountDefaultGroups[group].fields[field];
      if (selected[field]) {
        const existing = accounts.find((a: any) => a.id === selected[field]);
        if (!existing || existing.currency !== currency || !acceptsDefaultAccount(rule, existing)) throw badRequest(`Fix the company ${rule.label} default in Account settings`);
        continue;
      }
      // Loan receipts and long-term liability inherit existing investment selections.
      const inherited = group === 'loans' ? defaults.investments?.[field === 'bank' ? 'counterAccountId' : field === 'longTerm' ? 'loanAccountId' : ''] : undefined;
      let account = accounts.find((a: any) => a.id === inherited && a.currency === currency && acceptsDefaultAccount(rule, a));
      if (!account) account = accounts.find((a: any) => a.code === code && a.currency === currency && acceptsDefaultAccount(rule, a));
      if (!account) {
        const occupied = await db.accountingAccount.findFirstIncludingDeleted({ where: { code } });
        if (occupied) throw badRequest(`Standard account ${code} is unavailable; select an active ${rule.label} default in Account settings`);
        const [name, , accountType, category] = investmentDefaultAccounts.find(spec => spec[1] === code)!;
        account = await db.accountingAccount.create({ data: { name, code, accountType, category, currency, isSystem: true } });
        accounts.push(account);
        await logActivity({ ...context(), resource: 'accounting-account', resourceId: account.id, action: 'created', meta: { ...account, reason: 'investment-loan-default' } });
      }
      selected[field] = account.id;
    }
    if (Object.keys(selected).some(key => selected[key] !== previous[key])) {
      await logActivity({ ...context(), resource: 'account-defaults', resourceId: group, action: 'configured', meta: selected });
      await logActivity({ ...context(), resource: 'investment-default-repair', resourceId: group, action: 'updated', meta: { before: previous, after: selected } });
    }
    defaults[group] = selected;
  }
  return defaults;
}
accountSettingsRouter.post('/investment-defaults', async (_req, res) => res.json({ defaults: await ensureInvestmentAccountDefaults() }));
accountSettingsRouter.get('/', async (_req, res) => {
  const accounts = await db.accountingAccount.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const suppliers = await db.$queryRawUnsafe(`SELECT d.id,d.name FROM distributors d JOIN distributor_companies dc ON dc.distributor_id=d.id WHERE dc.company_id=$1 ORDER BY d.name`, context().companyId);
  res.json({ defaults: await accountDefaults(), accounts, suppliers });
});
accountSettingsRouter.put('/receive-pay', async (req, res) => {
  const { receiveAccountId, payAccountId } = z.object({ receiveAccountId: z.string(), payAccountId: z.string() }).parse(req.body);
  const accounts = await db.accountingAccount.findMany({ where: { id: { in: [receiveAccountId, payAccountId].filter(Boolean) }, isActive: true } });
  for (const id of [receiveAccountId, payAccountId].filter(Boolean)) {
    const account = accounts.find((a:any) => a.id === id);
    if (!account || !['CASH', 'BANK'].includes(account.accountType)) throw badRequest('Choose active company Cash or Bank accounts for Receive / Pay money');
  }
  for (const [group, id] of [['receive', receiveAccountId], ['pay', payAccountId]]) {
    await logActivity({ ...context(), action: 'configured', resource: 'account-defaults', resourceId: group, meta: id ? { moneyAccountId: id } : {} });
  }
  res.json({ success: true });
});
accountSettingsRouter.put('/:group', async (req, res) => {
  const group = accountDefaultGroups[req.params.group];
  if (!group) throw badRequest('Unknown account settings group');
  const { mappings, profitDistributionAccountId } = z.object({ mappings: z.record(z.string()), profitDistributionAccountId: z.string().min(1).optional() }).parse(req.body);
  const selected = Object.fromEntries(Object.entries(mappings).filter(([, id]) => id));
  const accounts = await db.accountingAccount.findMany({ where: { id: { in: Object.values(selected) }, isActive: true } });
  for (const [key, id] of Object.entries(selected)) {
    const field = group.fields[key], account = accounts.find((a: any) => a.id === id);
    if (!field || !account || !acceptsDefaultAccount(field, account)) throw badRequest(`Select an active company account for ${field?.label || key}`);
  }
  if (req.params.group === 'transfers' && selected.fromAccountId && selected.fromAccountId === selected.toAccountId) throw badRequest('Transfer accounts must be different');
  if (profitDistributionAccountId !== undefined) {
    if (req.params.group !== 'investments') throw badRequest('Profit distribution belongs to investment settings');
    if (!['admin', 'manager'].includes(context().role)) throw badRequest('Only managers and admins can change the profit distribution account');
    await validateProfitDistributionAccount(profitDistributionAccountId);
    if (Object.values(selected).includes(profitDistributionAccountId)) throw badRequest('Choose a separate equity account for profit distribution');
  }
  await logActivity({ ...context(), action: 'configured', resource: 'account-defaults', resourceId: req.params.group, meta: selected });
  if (profitDistributionAccountId !== undefined) await logActivity({ ...context(), action: 'configured', resource: 'investor-profit-settings', resourceId: context().companyId, meta: { accountId: profitDistributionAccountId } });
  res.json({ success: true });
});
