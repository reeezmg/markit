import { timingSafeEqual } from 'node:crypto';
import { createError, defineEventHandler, getHeader, setHeader } from 'h3';
import { pool } from '~/server/db';
import { processRecurringExpenses } from '~/server/utils/recurring-expenses';

export default defineEventHandler(async event => {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(getHeader(event, 'authorization') || '');
  const expected = Buffer.from(`Bearer ${secret || ''}`);
  if (!secret || secret.length < 16 || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  setHeader(event, 'Cache-Control', 'no-store');
  const result = await processRecurringExpenses(pool);
  if (result.failed) throw createError({ statusCode: 500, statusMessage: 'Some recurring expenses failed; inspect their schedule status', data: result });
  return result;
});
