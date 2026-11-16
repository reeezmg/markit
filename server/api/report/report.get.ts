import { dailyReport } from '~/server/utils/report-daily';
import { dailyReportBlock, dailyReportBlocks, type DailyReportBlock } from '~/server/utils/report-daily-blocks';
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

  if (query.block !== undefined && !dailyReportBlocks.includes(query.block as DailyReportBlock)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid daily report block' });
  }
  const context = {
    companyId,
    startDate,
    endDate,
    useOriginalCleanupValues,
    includeCleanupPrecedence,
  };
  return query.block
    ? dailyReportBlock(pool, context, query.block as DailyReportBlock)
    : dailyReport(pool, context);
});
