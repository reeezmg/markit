import { createError, defineEventHandler, readBody } from 'h3';
import { prisma } from '~/server/prisma';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { printPreference } from '~/server/utils/printTemplateSettings';
import { printSettingsSchema } from '~/utils/print-templates';

export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event);
  if (!['admin', 'manager'].includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'Only administrators and managers can save print designs' });
  const body = await readBody(event);
  if (JSON.stringify(body).length > 2000000) throw createError({ statusCode: 413, statusMessage: 'Print designs are too large. Use smaller logos.' });
  const parsed = printSettingsSchema.safeParse(body);
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid print design' });
  const preference = printPreference(session.data.companyId);
  await prisma.$transaction(async tx => {
    const previous = await tx.generalPreference.findUnique({ where: { companyId_pageName_key: preference } });
    if (previous) {
      const backup = printPreference(session.data.companyId, 'templates-backup');
      await tx.generalPreference.upsert({ where: { companyId_pageName_key: backup }, create: { ...backup, value: previous.value! }, update: { value: previous.value! } });
    }
    await tx.generalPreference.upsert({ where: { companyId_pageName_key: preference }, create: { ...preference, value: parsed.data }, update: { value: parsed.data, active: true } });
  });
  return parsed.data;
});
