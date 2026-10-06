import { createError, defineEventHandler, getQuery, getRequestURL, readBody, setResponseStatus } from 'h3';
import { ZodError } from 'zod';
import { useCompanyRequestSession } from '../../utils/companyRequestScope';
import { runAccountant, logActivity } from '../../utils/accountant/context';
import { accountingAccountRouter } from '../../utils/accountant/accounts';
import { manualJournalRouter } from '../../utils/accountant/journals';
import { accountTransferRouter } from '../../utils/accountant/transfers';
import { accountantManagementRouter } from '../../utils/accountant/management';
import { directoryRouter } from '../../utils/accountant/directories';
import { rbac } from '../../utils/accountant/router';
import { distributorAccountingRouter } from '../../utils/accountant/distributors';
import { moneyRouter } from '../../utils/accountant/money';
import { investorRouter } from '../../utils/accountant/investors';
import { investorProfitRouter } from '../../utils/accountant/investor-profits';
import { userAccountingRouter } from '../../utils/accountant/users';
import { erpAccountingRouter } from '../../utils/accountant/erp';
import { ecommerceAccountingRouter } from '../../utils/accountant/ecommerce';
import { accountSettingsRouter } from '../../utils/accountant/account-settings';

export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event);
  const user = { companyId: session.data.companyId, userId: session.data.id, role: session.data.role };
  const req = { user, body: ['GET', 'HEAD'].includes(event.method) ? {} : await readBody(event), query: getQuery(event), params: {} };
  let result: unknown;
  const res = { json: (data: any) => { result = data; return res; }, status: (code: number) => { setResponseStatus(event, code); return res; } };
  await rbac('ACCOUNT', 'READ')(req, res);
  const path = getRequestURL(event).pathname.replace(/^\/api\/accountant\/?/, '');
  const [resource, ...parts] = path.split('/');
  const routes = { 'account-settings': accountSettingsRouter, 'accounting-accounts': accountingAccountRouter, 'manual-journals': manualJournalRouter,
    'account-transfers': accountTransferRouter, 'accountant-management': accountantManagementRouter, 'investor-profits': investorProfitRouter,
    parties: directoryRouter, projects: directoryRouter, distributors: distributorAccountingRouter, erp: erpAccountingRouter, ecommerce: ecommerceAccountingRouter, users: userAccountingRouter, money: moneyRouter, investors: investorRouter };
  const router = routes[resource as keyof typeof routes];
  if (!router) throw createError({ statusCode: 404 });
  try {
    await runAccountant(user, async () => {
      await router.dispatch(event.method, resource === 'parties' || resource === 'projects' ? `/${resource}` : `/${parts.join('/')}`, req, res);
      if (!['GET', 'HEAD'].includes(event.method)) await logActivity({ ...user,
        action: event.method, resource, resourceId: parts.join('/') || (result as any)?.id || '', meta: {} });
    }, { lockCompany: resource === 'users', ...(resource === 'investor-profits' ? { transactionTimeoutMs: 120000 } : {}) });
    return result;
  } catch (error: any) {
    if (error instanceof ZodError) throw createError({ statusCode: 400, statusMessage: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
    if (error.code === 'P2002') throw createError({ statusCode: 409, statusMessage: 'A record with this name, code or posting period already exists' });
    if (error.code === 'P2025') throw createError({ statusCode: 404, statusMessage: 'Accounting record not found' });
    throw error;
  }
});
