import { defineEventHandler, readBody, createError } from 'h3';
import { ZodError } from 'zod';
import { useCompanyRequestSession } from '../../utils/companyRequestScope';
import { runAccountant } from '../../utils/accountant/context';
import { saveDistributorForm } from '../../utils/distributor-form';

export default defineEventHandler(async event => {
  const { data } = await useCompanyRequestSession(event);
  const body = await readBody(event);
  try {
    return await runAccountant({ companyId: data.companyId, userId: data.id, role: data.role },
      () => saveDistributorForm(body), { lockCompany: true, transactionTimeoutMs: 120000 });
  } catch (error: any) {
    if (error instanceof ZodError) throw createError({ statusCode: 400, statusMessage: error.issues.map(issue => issue.message).join('; ') });
    throw error;
  }
});
