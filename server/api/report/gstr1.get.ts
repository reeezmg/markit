import { defineEventHandler, getQuery } from 'h3';
import { pool } from '~/server/db';
import { getReadCompanyId } from '~/server/utils/organizationReadScope';
import { outwardTaxReport } from '~/server/utils/report-gst-source';
import { taxAccountingReport, reportWindow } from '~/server/utils/report-accounting';
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event),
    companyId = await getReadCompanyId(event),
    { from, to } = reportWindow(getQuery(event));
  const [source, accounting] = await Promise.all([
    outwardTaxReport(pool, companyId, from, to, session.data.cleanup ?? false),
    taxAccountingReport(pool, companyId, from, to),
  ]);
  return { ...source, accounting };
});
