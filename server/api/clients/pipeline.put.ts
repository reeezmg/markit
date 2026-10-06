import { prisma } from '~/server/prisma';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event);
  const { clientId, stage } = await readBody(event);
  const stages = ['new', 'prospect', 'viewing', 'reject', 'close'];
  if (!clientId || !stages.includes(stage)) throw createError({ statusCode: 400, statusMessage: 'Select a valid client and stage' });
  const companyId = session.data.companyId;
  return prisma.$transaction(async tx => {
    await tx.companyClient.update({ where: { companyId_clientId: { companyId, clientId } }, data: { pipelineStatus: stage } });
    const pipeline = await tx.pipeline.findUnique({ where: { companyId } });
    if (pipeline) await tx.pipeline.update({ where: { id: pipeline.id }, data: Object.fromEntries(stages.map(name => {
      const field = `${name}Clients`;
      const ids = ((pipeline as any)[field] ?? []).filter((id: string) => id !== clientId);
      if (name === stage) ids.push(clientId);
      return [field, ids];
    })) });
    return { success: true };
  }, { isolationLevel: 'Serializable' });
});
