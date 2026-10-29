import { defineEventHandler, getQuery, createError } from 'h3';
import { useCompanyRequestSession } from '../../utils/companyRequestScope';
import { runAccountant } from '../../utils/accountant/context';
import { loadDistributorForm } from '../../utils/distributor-form';

export default defineEventHandler(async event => {
  const { data } = await useCompanyRequestSession(event);
  const id = getQuery(event).id;
  if (id !== undefined && typeof id !== 'string') throw createError({ statusCode: 400, statusMessage: 'Invalid distributor' });
  return runAccountant({ companyId: data.companyId, userId: data.id, role: data.role },
    () => loadDistributorForm(id as string | undefined), { readOnly: true });
});
