import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { pool } from '~/server/db';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';

export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event);
  const body = await readBody(event);
  if (typeof body?.active !== 'boolean') throw createError({ statusCode: 400, statusMessage: 'Invalid schedule status' });
  const result = await pool.query(`UPDATE recurring_expenses SET active=$3,updated_at=now()
    WHERE id=$1 AND company_id=$2 RETURNING id`, [getRouterParam(event, 'id'), session.data.companyId, body.active]);
  if (!result.rowCount) throw createError({ statusCode: 404, statusMessage: 'Schedule not found' });
  return { success: true };
});
