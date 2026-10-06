import { createError, getHeader, getQuery, getRequestURL, type H3Event } from 'h3';
import { prisma } from '~/server/prisma';
import { getAllStoreIds, getHeadOfficeAdmin } from './organizationAccess';
import { normalizeBillingUnits } from '~/utils/billing-units';
import { normalizeSizeLabels } from '~/utils/size-labels';

/** Authorization always starts from the authenticated company, never from a form selection. */
export async function authorizedCompanyIds(event: H3Event): Promise<string[]> {
  if (!event.context.authorizedCompanyIds) {
    event.context.authorizedCompanyIds = (async () => {
      const session = await requireAuthSession(event);
      const id = session.data.companyId;
      return await getHeadOfficeAdmin(session.data.id, id)
        ? getAllStoreIds(session.data.id, id) : [id];
    })();
  }
  return event.context.authorizedCompanyIds;
}

export async function assertCompanyAccess(event: H3Event, companyId: string) {
  if (!companyId || !(await authorizedCompanyIds(event)).includes(companyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Company access denied' });
  }
  return companyId;
}

export async function companySettings(companyId: string) {
  const c = await prisma.company.findUniqueOrThrow({ where: { id: companyId },
    include: { address: true, pipeline: true, productinput: true, variantinput: true } });
  const purchase = await prisma.expenseCategory.findFirst({ where: { companyId, name: 'Purchase' }, select: { id: true } });
  const { id, name, type, phone, productinput, variantinput, pipeline, address, ...fields } = c;
  // Only presentation/entry settings belong in the form context (no integration credentials).
  const keys = ['logo', 'currency', 'plan', 'isTaxIncluded', 'isCostIncluded', 'isUserTrackIncluded',
    'isAiImage', 'pointsValue', 'closingDate', 'openTime', 'closeTime', 'gstin', 'billPrefix',
    'expensePrefix', 'distributorPrefix', 'distributorPaymentPrefix', 'distributorCreditPrefix',
    'clientPrefix', 'userPrefix', 'accountPrefix', 'printerLabelSize', 'storeUniqueName',
    'description', 'thankYouNote', 'refundPolicy', 'returnPolicy', 'accHolderName', 'ifsc',
    'accountNo', 'bankName', 'upiId', 'deliveryType', 'deliveryMode', 'deliveryRadius',
    'deliveryDiscount', 'codCharge', 'commissionRate', 'category', 'cash', 'bank',
    'openingCashDate', 'openingBankDate'];
  return { ...Object.fromEntries(keys.map(key => [key, (fields as any)[key]])),
    companyId: id, companyName: name, companyType: type, companyPhone: phone,
    address, pipelineId: pipeline?.id, purchaseExpenseCategoryId: purchase?.id,
    productInputs: productinput ? { name: productinput.name, brand: productinput.brand,
      category: productinput.category, subcategory: productinput.subcategory, description: productinput.description } : undefined,
    variantInputs: variantinput ? { name: variantinput.name, code: variantinput.code,
      sprice: variantinput.sprice, pprice: variantinput.pprice, dprice: variantinput.dprice,
      discount: variantinput.discount, qty: variantinput.qty, sizes: variantinput.sizes,
      images: variantinput.images, button: variantinput.button,
      unit: normalizeBillingUnits(variantinput.unit), sizeLabels: normalizeSizeLabels(variantinput.sizeLabels) } : undefined };
}

/** A request-local company context. This never writes the authentication cookie. */
export async function useCompanyRequestSession(event: H3Event) {
  const session = await requireAuthSession(event);
  const requested = event.context.requestCompanyId || getHeader(event, 'x-company-id') || getQuery(event).companyId;
  let companyId = typeof requested === 'string' && requested ? requested : session.data.companyId;
  const expenseId = getRequestURL(event).pathname.match(/^\/api\/accounts\/expenses\/([^/]+)$/)?.[1];
  if (expenseId && ['DELETE', 'PUT'].includes(event.method)) {
    const record = await prisma.expense.findUnique({ where: { id: expenseId }, select: { companyId: true } });
    if (!record) throw createError({ statusCode: 404, statusMessage: 'Expense not found' });
    companyId = record.companyId;
  }
  await assertCompanyAccess(event, companyId);
  if (companyId === session.data.companyId) return session;
  const settings = await companySettings(companyId);
  return { ...session, data: { ...session.data, ...settings } } as typeof session;
}
