import { prisma } from '~/server/prisma';
import { initializeNewCompanyAccounts } from '~/server/utils/accountant/company-account-defaults';

export default eventHandler(async (event) => {
  const session = await requireAuthSession(event);
  const body = await readBody(event);
  const name = String(body?.name ?? '').trim();
  const phone = String(body?.phone ?? '').trim();
  const city = String(body?.city ?? '').trim();
  const state = String(body?.state ?? '').trim();
  if (!name || name.length > 120 || phone.length > 30 || city.length > 120 || state.length > 120) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid branch name and details' });
  }
  const membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId: session.data.companyId, userId: session.data.id } },
  });
  if (!membership || membership.role !== 'admin' || !membership.status || membership.deleted) {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' });
  }
  return prisma.$transaction(async (tx) => {
    const parent = await tx.company.findUnique({ where: { id: session.data.companyId } });
    if (!parent?.isHeadOffice || parent.parentCompanyId) {
      throw createError({ statusCode: 409, statusMessage: 'Select a head office before adding branches' });
    }
    const branch = await tx.company.create({
      data: {
        name, type: parent.type, plan: parent.plan, parentCompany: { connect: { id: parent.id } },
        category: [], deliveryType: [], deliveryMode: [], phone: phone || null,
        address: city || state ? { create: { city: city || null, state: state || null } } : undefined,
        productinput: { create: {} }, variantinput: { create: {} },
      },
    });
    await tx.companyUser.create({
      data: { companyId: branch.id, userId: session.data.id, role: 'admin', code: 1, name: membership.name },
    });
    await tx.expenseCategory.create({ data: { companyId: branch.id, name: 'Purchase', status: true } });
    await tx.pipeline.create({ data: { companyId: branch.id } });
    await initializeNewCompanyAccounts(tx, branch.id, session.data.id);
    return { id: branch.id, name: branch.name };
  }, { maxWait: 10000, timeout: 30000 });
});
