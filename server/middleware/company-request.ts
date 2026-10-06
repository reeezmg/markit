import { prisma } from '~/server/prisma';
import { assertCompanyAccess } from '~/server/utils/companyRequestScope';

const foreignKeys: Record<string, string> = { shiftId: 'shift', cycleId: 'payrollCycle', cycleLineId: 'payrollCycleLine', categoryId: 'category', subcategoryId: 'subcategory',
  brandId: 'brand', collectionId: 'collection', dimensionId: 'shippingBox', itemId: 'item',
  variantId: 'variant', productId: 'product', poId: 'purchaseOrder', purchaseOrderId: 'purchaseOrder',
  expensecategoryId: 'expenseCategory', expenseCategoryId: 'expenseCategory', bankAccountId: 'bankAccount', accountId: 'account' };
const relations: Record<string, string> = { category: 'category', subcategory: 'subcategory', brand: 'brand',
  collection: 'collection', dimension: 'shippingBox', product: 'product', variant: 'variant', item: 'item', purchaseOrder: 'purchaseOrder', expensecategory: 'expenseCategory', account: 'account' };

export default defineEventHandler(async event => {
  const path = getRequestURL(event).pathname;
  if (!/^\/api\/(users\/|salary\/|attendance\/|clients\/|bill(?:Edit|Sale)?\/|products\/|purchaseorder\/|purchasereturn\/|distributor\/|counter\/|discount\/|dimensions(?:\/|$)|accounts\/(?:expenses|expense-categories|company-users|transactions)(?:\/|$))/.test(path)) return;
  const session = await requireAuthSession(event);
  const query = getQuery(event);
  const isWrite = !['GET', 'HEAD'].includes(event.method) && !/findMany|by-ids|search|findFirst/.test(path);
  event.context.companyScopeChecks = [];
  const body = isWrite ? await readBody(event) : null;
  let companyId = getHeader(event, 'x-company-id') || query.companyId || body?.companyId || session.data.companyId;
  if (typeof companyId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Invalid company' });
  await assertCompanyAccess(event, companyId);
  if (!isWrite || !body) return;
  async function check(model: string, id: unknown, mustExist = false) {
    if (typeof id !== 'string' || !id) return;
    const row = await (prisma as any)[model].findUnique({ where: { id }, select: { companyId: true } });
    if ((!row && mustExist) || (row && row.companyId !== companyId)) {
      throw createError({ statusCode: 403, statusMessage: 'Record or selected option belongs to another company' });
    }
    if (row) event.context.companyScopeChecks.push({ model, id, companyId });
  }
  async function validate(value: any, parentKey = ''): Promise<void> {
    if (Array.isArray(value)) { for (const item of value) await validate(item, parentKey); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'companyId' && item && item !== companyId) throw createError({ statusCode: 403, statusMessage: 'Mixed company request' });
      if (foreignKeys[key]) await check(key === 'accountId' && path.includes('/accounts/transactions') ? 'bankAccount' : foreignKeys[key], item);
      if (relations[key] && (item as any)?.connect?.id) await check(relations[key], (item as any).connect.id, true);
      if (key === 'distributorId' && typeof item === 'string' && item) {
        const link = await prisma.distributorCompany.findUnique({ where: { distributorId_companyId: { companyId: companyId as string, distributorId: item } } });
        if (!link) throw createError({ statusCode: 400, statusMessage: 'Select a distributor linked to this company' });
      }
      if (['includeUserIds', 'excludeUserIds', 'userIds'].includes(key) && Array.isArray(item)) {
        for (const userId of item) await validate({ userId });
      }
      if (key === 'userId' && typeof item === 'string' && item) {
        const member = await prisma.companyUser.findUnique({ where: { companyId_userId: { companyId: companyId as string, userId: item } } });
        if (!member) throw createError({ statusCode: 403, statusMessage: 'Staff member belongs to another company' });
      }
      if (key === 'company' && (item as any)?.connect?.id && (item as any).connect.id !== companyId) throw createError({ statusCode: 403, statusMessage: 'Mixed company request' });
      if (key === 'id' && parentKey === 'items' && /\/bill\//.test(path)) await check('item', item, true);
      await validate(item, key);
    }
  }
  await validate(body);
  const root = path.startsWith('/api/products/') ? 'product' : /\/bill(?:Sale)?\//.test(path) ? 'bill'
    : path.startsWith('/api/purchaseorder/') ? 'purchaseOrder' : path.startsWith('/api/purchasereturn/') ? 'purchaseReturn' : null;
  if (root && /update|delete|recalculate|due-cleared/.test(path)) {
    await check(root, body.id || body.poId || body.billId || body.billData?.id || body.product?.id, true);
  }
});
