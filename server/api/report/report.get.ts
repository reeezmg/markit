import { dailyReport } from '~/server/utils/report-daily';
import { defineEventHandler, getQuery, createError } from 'h3';
import { pool } from '~/server/db';
import { reportWindow } from '~/server/utils/report-accounting';
import { getReadCompanyId } from '~/server/utils/organizationReadScope';

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event);
  const companyId = await getReadCompanyId(event);
  const cleanup = session.data.cleanup ?? false;

  if (!companyId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const query = getQuery(event);
  const showCleanedValues = String(query.showCleanedValues) === 'true';
  const useOriginalCleanupValues = cleanup && !showCleanedValues;
  const includeCleanupPrecedence = cleanup && !showCleanedValues;

  const { from: startDate, to: endDate } = reportWindow(query);

  return dailyReport(pool, {
    companyId,
    startDate,
    endDate,
    useOriginalCleanupValues,
    includeCleanupPrecedence,
  });
});
