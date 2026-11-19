import { defineEventHandler, setHeader } from 'h3';
import { pool } from '../../db';
import { getReadCompanyId } from '../../utils/organizationReadScope';
import { readSalesWorkflow } from '../../utils/sales-workflow';
import { billingPreferenceRoles } from '../../utils/billing-preferences';
export default defineEventHandler(async event => {
    const companyId = await getReadCompanyId(event), session = await requireAuthSession(event);
    setHeader(event, 'Cache-Control', 'no-store');
    return { preferences: await readSalesWorkflow(pool, companyId), canManage: billingPreferenceRoles.includes(session.data.role) };
});
