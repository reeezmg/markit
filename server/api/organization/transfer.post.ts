import { pool } from '~/server/db';
import { assertCompanyAccess } from '~/server/utils/companyRequestScope';
import { getHeadOfficeAdmin } from '~/server/utils/organizationAccess';
import { executeCompanyTransfer, transferGraph, type TransferInput } from '~/server/utils/companyTransfer';

export default defineEventHandler(async event => {
  const session = await requireAuthSession(event);
  if (!await getHeadOfficeAdmin(session.data.id, session.data.companyId)) throw createError({ statusCode: 403, statusMessage: 'Head office admin access required' });
  const input = await readBody<TransferInput & { preview?: boolean }>(event);
  if (input.model === 'CompanyUser' && input.id === session.data.id && input.sourceCompanyId === session.data.companyId) {
    throw createError({ statusCode: 409, statusMessage: 'Your active company membership cannot be transferred while you are using it' });
  }
  await assertCompanyAccess(event, input.sourceCompanyId);
  await assertCompanyAccess(event, input.companyId);
  const db = await pool.connect();
  try {
    await db.query(input.preview ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN ISOLATION LEVEL SERIALIZABLE');
    if (input.preview) {
      const graph = await transferGraph(db, input);
      const records = [...graph.nodes.values()].map(({ model, row }) => ({ model, id: row.id,
        label: row.name || row.invoiceNumber || row.purchaseOrderNo || row.id,
        quantity: row.qty ?? null, amount: row.amount ?? row.grandTotal ?? row.totalAmount ?? null }));
      await db.query('COMMIT');
      return { fingerprint: graph.fingerprint, records, requirements: graph.requirements };
    }
    const result = await executeCompanyTransfer(db, input);
    await db.query('COMMIT');
    return result;
  } catch (error: any) {
    await db.query('ROLLBACK');
    if (['40001', '40P01'].includes(error.code)) throw createError({ statusCode: 409, statusMessage: 'Data changed during transfer. Preview again.' });
    if (error.code === '23505') throw createError({ statusCode: 409, statusMessage: 'A record with the same unique value exists in the destination company' });
    throw error;
  } finally { db.release(); }
});
