import { prisma } from '~/server/prisma';
import { getHeadOfficeAdmin } from '~/server/utils/organizationAccess';

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname;
  if (!path.startsWith('/api/') ||
      ['/api/auth/login', '/api/auth/logout', '/api/auth/switch-company', '/api/auth/view-scope'].includes(path)) return;
  const session = await useAuthSession(event);
  if (!session.data.id || !session.data.companyId) return;
  if (session.data.delegatedHeadOfficeId) {
    const [headOffice, branch] = await Promise.all([
      getHeadOfficeAdmin(session.data.id, session.data.delegatedHeadOfficeId),
      prisma.company.findUnique({ where: { id: session.data.companyId }, select: { parentCompanyId: true, status: true } }),
    ]);
    if (!headOffice || !branch?.status || branch.parentCompanyId !== session.data.delegatedHeadOfficeId) {
      throw createError({ statusCode: 403, statusMessage: 'Head office access has been removed' });
    }
  }
  if (session.data.allStores && path !== '/api/auth/session') {
    if (!await getHeadOfficeAdmin(session.data.id,
        session.data.companyId)) {
      throw createError({ statusCode: 403, statusMessage: 'Head office access has been removed' });
    }
  }
});
