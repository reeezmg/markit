import { defineEventHandler } from 'h3';
import { pool } from '~/server/db';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { processRecurringExpenses } from '~/server/utils/recurring-expenses';

export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event);
  return processRecurringExpenses(pool, session.data.companyId);
});
