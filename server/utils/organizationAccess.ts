import { prisma } from '~/server/prisma';

export async function getHeadOfficeAdmin(userId: string, headOfficeId: string) {
  const membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId: headOfficeId, userId } },
    include: { company: { select: { id: true, isHeadOffice: true, status: true, parentCompanyId: true } } },
  });
  return membership?.role === 'admin' && membership.status && !membership.deleted &&
    membership.company.status && membership.company.isHeadOffice && !membership.company.parentCompanyId
    ? membership : null;
}

export async function listAccessibleCompanies(userId: string) {
  const memberships = await prisma.companyUser.findMany({
    where: { userId, status: true, deleted: false, company: { status: true } },
    include: { company: { select: { id: true, name: true, logo: true, parentCompanyId: true, isHeadOffice: true } } },
  });
  const headOfficeIds = memberships
    .filter((item) => item.role === 'admin' && item.company.isHeadOffice && !item.company.parentCompanyId)
    .map((item) => item.companyId);
  const branches = headOfficeIds.length
    ? await prisma.company.findMany({
        where: { parentCompanyId: { in: headOfficeIds }, status: true },
        select: { id: true, name: true, logo: true, parentCompanyId: true, isHeadOffice: true },
      })
    : [];
  const companies = new Map(memberships
    .filter((item) => !item.delegatedHeadOfficeId ||
      (headOfficeIds.includes(item.delegatedHeadOfficeId) && item.company.parentCompanyId === item.delegatedHeadOfficeId))
    .map((item) => [item.companyId, item.company]));
  for (const branch of branches) companies.set(branch.id, branch);
  return [...companies.values()];
}

export async function getAllStoreIds(userId: string, headOfficeId: string) {
  if (!await getHeadOfficeAdmin(userId, headOfficeId)) {
    throw createError({ statusCode: 403, statusMessage: 'Head office admin access required' });
  }
  const branches = await prisma.company.findMany({
    where: { parentCompanyId: headOfficeId, status: true }, select: { id: true },
  });
  return [headOfficeId, ...branches.map((branch) => branch.id)];
}

export async function ensureHeadOfficeBranchMemberships(userId: string, headOfficeId: string, name: string | null) {
  const ids = (await getAllStoreIds(userId, headOfficeId)).slice(1);
  if (!ids.length) return;
  const existing = await prisma.companyUser.findMany({
    where: { userId, companyId: { in: ids } }, select: { companyId: true },
  });
  const existingIds = new Set(existing.map((item) => item.companyId));
  const missing = ids.filter((id) => !existingIds.has(id));
  if (missing.length) {
    await prisma.companyUser.createMany({
      data: missing.map((companyId) => ({
        companyId, userId, role: 'admin', name, delegatedHeadOfficeId: headOfficeId,
      })),
      skipDuplicates: true,
    });
  }
  await prisma.companyUser.updateMany({
    where: { userId, companyId: { in: ids }, delegatedHeadOfficeId: headOfficeId },
    data: { status: true, deleted: false },
  });
}
