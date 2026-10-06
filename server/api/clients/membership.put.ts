import { prisma } from '~/server/prisma';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event);
  const body = await readBody(event);
  const companyId = session.data.companyId;
  if (!body.clientId || !body.name?.trim() || !body.phone?.trim()) throw createError({ statusCode: 400, statusMessage: 'Client, name and phone are required' });
  return prisma.$transaction(async tx => {
    const link = await tx.companyClient.findUnique({ where: { companyId_clientId: { companyId, clientId: body.clientId } } });
    if (!link) throw createError({ statusCode: 404, statusMessage: 'Client is not linked to this company' });
    await tx.client.update({ where: { id: body.clientId }, data: { name: body.name.trim(), phone: body.phone.trim(), email: body.email?.trim() || null } });
    return { success: true };
  }, { isolationLevel: 'Serializable' });
});
