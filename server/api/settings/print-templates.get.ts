import { defineEventHandler } from 'h3';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { readPrintSettings } from '~/server/utils/printTemplateSettings';

export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event);
  return readPrintSettings(session.data.companyId);
});
