import { prisma } from '~/server/prisma';
import { ensureHeadOfficeBranchMemberships, getAllStoreIds, getHeadOfficeAdmin } from '~/server/utils/organizationAccess';
import { normalizeBillingUnits } from '~/utils/billing-units';
import { normalizeSizeLabels } from '~/utils/size-labels';

export default eventHandler(async (event) => {
  const session = await requireAuthSession(event);
  const { companyId, keepOrganization } = await readBody(event);
  if (keepOrganization) throw createError({ statusCode: 400, statusMessage: 'Use a company ID on the form request' });
  if (typeof companyId !== 'string' || !companyId) {
    throw createError({ statusCode: 400, statusMessage: 'Company ID is required' });
  }
  let membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId, userId: session.data.id } },
    include: { company: { include: { address: true, pipeline: true, productinput: true, variantinput: true } } },
  });
  const target = membership?.company ?? await prisma.company.findUnique({
    where: { id: companyId }, include: { address: true, pipeline: true, productinput: true, variantinput: true },
  });
  if (!target?.status) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have access to this company' });
  }
  const headOfficeMembership = target.parentCompanyId
    ? await getHeadOfficeAdmin(session.data.id, target.parentCompanyId)
    : null;
  if ((!membership || !membership.status || membership.deleted) && headOfficeMembership) {
    membership = await prisma.companyUser.upsert({
      where: { companyId_userId: { companyId, userId: session.data.id } },
      create: {
        companyId, userId: session.data.id, role: 'admin', name: headOfficeMembership.name,
        delegatedHeadOfficeId: target.parentCompanyId,
      },
      update: { role: 'admin', status: true, deleted: false, delegatedHeadOfficeId: target.parentCompanyId },
      include: { company: { include: { address: true, pipeline: true, productinput: true, variantinput: true } } },
    });
  }
  if (!membership || !membership.status || membership.deleted || !membership.company.status ||
      (membership.delegatedHeadOfficeId &&
        (membership.delegatedHeadOfficeId !== target.parentCompanyId || !headOfficeMembership))) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have access to this company' });
  }
  const c = membership.company;
  const delegatedHeadOfficeId = headOfficeMembership && membership.role !== 'admin'
    ? target.parentCompanyId
    : membership.delegatedHeadOfficeId;
  const role = headOfficeMembership ? 'admin' : membership.role;
  if (c.isHeadOffice && role === 'admin' && !c.parentCompanyId) {
    await ensureHeadOfficeBranchMemberships(session.data.id, c.id, membership.name);
  }
  const purchaseCategory = await prisma.expenseCategory.findFirst({
    where: { companyId: c.id, name: 'Purchase' }, select: { id: true },
  });
  if (!purchaseCategory) throw createError({ statusCode: 409, statusMessage: 'Company setup is incomplete' });
  await session.update({
    ...session.data,
    companyId: c.id, companyName: c.name, companyType: c.type,
    name: membership.name, code: String(membership.code ?? ''), role, type: role,
    delegatedHeadOfficeId: delegatedHeadOfficeId ?? undefined,
    allStores: c.isHeadOffice && role === 'admin' && !c.parentCompanyId,
    organizationHeadOfficeId: undefined,
    readCompanyId: undefined,
    purchaseExpenseCategoryId: purchaseCategory.id, pipelineId: c.pipeline?.id ?? '',
    logo: c.logo ?? undefined, companyPhone: c.phone ?? undefined, storeUniqueName: c.storeUniqueName ?? undefined,
    description: c.description ?? undefined, thankYouNote: c.thankYouNote ?? undefined,
    refundPolicy: c.refundPolicy ?? undefined, returnPolicy: c.returnPolicy ?? undefined,
    isTaxIncluded: c.isTaxIncluded, isCostIncluded: c.isCostIncluded,
    isAiImage: c.isAiImage, isUserTrackIncluded: c.isUserTrackIncluded,
    deliveryType: c.deliveryType, deliveryMode: c.deliveryMode,
    deliveryRadius: c.deliveryRadius ?? 0, deliveryDiscount: c.deliveryDiscount ?? 0,
    codCharge: c.codCharge ?? 0, commissionRate: c.commissionRate ?? undefined,
    pointsValue: c.pointsValue, currency: c.currency, plan: c.plan,
    address: c.address ?? {}, openTime: c.openTime, closeTime: c.closeTime,
    gstin: c.gstin ?? '', accHolderName: c.accHolderName ?? '', ifsc: c.ifsc ?? '',
    accountNo: c.accountNo ?? '', bankName: c.bankName ?? '', upiId: c.upiId ?? '',
    cash: c.cash ?? 0, bank: c.bank ?? 0,
    openingCashDate: c.openingCashDate?.toISOString() ?? null,
    openingBankDate: c.openingBankDate?.toISOString() ?? null,
    closingDate: c.closingDate?.toISOString() ?? null,
    billPrefix: c.billPrefix ?? '', expensePrefix: c.expensePrefix ?? 'EXP',
    distributorPrefix: c.distributorPrefix ?? 'DIST',
    distributorPaymentPrefix: c.distributorPaymentPrefix ?? 'DP',
    distributorCreditPrefix: c.distributorCreditPrefix ?? 'DC',
    clientPrefix: c.clientPrefix ?? 'CL', userPrefix: c.userPrefix ?? '', accountPrefix: c.accountPrefix ?? 'ACC',
    printerLabelSize: c.printerLabelSize ?? undefined,
    productInputs: c.productinput ? {
      name: c.productinput.name, brand: c.productinput.brand,
      category: c.productinput.category, subcategory: c.productinput.subcategory,
      description: c.productinput.description,
    } : undefined,
    variantInputs: c.variantinput ? {
      name: c.variantinput.name, code: c.variantinput.code,
      sprice: c.variantinput.sprice, pprice: c.variantinput.pprice,
      dprice: c.variantinput.dprice, discount: c.variantinput.discount,
      qty: c.variantinput.qty, unit: normalizeBillingUnits(c.variantinput.unit),
      sizes: c.variantinput.sizes, sizeLabels: normalizeSizeLabels(c.variantinput.sizeLabels),
      images: c.variantinput.images, button: c.variantinput.button,
    } : undefined,
  });
  return { companyId: c.id };
});
