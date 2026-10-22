import { prisma } from '~/server/prisma';
import { emptyPrintSettings, printSettingsSchema } from '~/utils/print-templates';

export const printPreference = (companyId: string, key = 'templates') => ({ companyId, pageName: 'printer', key });
export async function readPrintSettings(companyId: string) {
  const record = await prisma.generalPreference.findUnique({ where: { companyId_pageName_key: printPreference(companyId) } });
  return record?.active ? printSettingsSchema.parse(record.value) : emptyPrintSettings();
}
