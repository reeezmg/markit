import { defineEventHandler } from 'h3';
import { prisma } from '~/server/prisma';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { customLabelVariables } from '~/utils/label-variables';

export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event);
  const definitions = await prisma.productCustomField.findMany({
    where: { companyId: session.data.companyId, active: true },
    select: { scope: true, key: true, label: true, type: true }, orderBy: { sortOrder: 'asc' },
  });
  return customLabelVariables(definitions);
});
