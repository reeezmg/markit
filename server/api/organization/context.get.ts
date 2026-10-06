import { assertCompanyAccess, companySettings } from '~/server/utils/companyRequestScope';
import { prisma } from '~/server/prisma';

export default defineEventHandler(async event => {
  const session = await requireAuthSession(event);
  const query = getQuery(event);
  let companyId = String(query.companyId || session.data.companyId);
  let record: { model: string; id: string; companyId: string } | undefined;
  if (query.model && query.id) {
    const models: Record<string, string> = { Bill: 'bill', Product: 'product', Brand: 'brand', Category: 'category',
      Collection: 'collection', PurchaseOrder: 'purchaseOrder', PurchaseReturn: 'purchaseReturn', PayrollCycle: 'payrollCycle' };
    const model = models[String(query.model)];
    if (!model) throw createError({ statusCode: 400, statusMessage: 'Unsupported form' });
    const row = await (prisma as any)[model].findUnique({ where: { id: String(query.id) }, select: { companyId: true } });
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' });
    companyId = row.companyId;
    record = { model: String(query.model), id: String(query.id), companyId };
  }
  await assertCompanyAccess(event, companyId);
  return { ...await companySettings(companyId), record };
});
