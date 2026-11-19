import { createError, defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { pool } from '../../db';
import { getReadCompanyId } from '../../utils/organizationReadScope';
import { saveSalesWorkflow } from '../../utils/sales-workflow';
import { billingPreferenceRoles } from '../../utils/billing-preferences';
export default defineEventHandler(async event => {
    const companyId = await getReadCompanyId(event), session = await requireAuthSession(event);
    if (!billingPreferenceRoles.includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'Only administrators, managers and accountants can change the sales workflow.' });
    const parsed = z.object({ includeInvoicing: z.boolean().optional(), includeAfterSales: z.boolean().optional() })
        .strict().refine(value => value.includeInvoicing !== undefined || value.includeAfterSales !== undefined)
        .safeParse(await readBody(event));
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choose whether to enable invoicing or after-sales.' });
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        if (!(await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])).rows.length) throw createError({ statusCode: 404, statusMessage: 'Company not found.' });
        const preferences = await saveSalesWorkflow(db, companyId, parsed.data);
        await db.query('COMMIT');
        return { preferences, canManage: true };
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
});
