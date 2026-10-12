import { defineEventHandler, getQuery } from 'h3';
import { pool } from '~/server/db';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { getReadCompanyIds } from '~/server/utils/organizationReadScope';

export default defineEventHandler(async event => {
  const ids = String(getQuery(event).forWrite || '') === '1'
    ? [(await useCompanyRequestSession(event)).data.companyId] : await getReadCompanyIds(event);
  const { rows } = await pool.query(`
    SELECT DISTINCT 'user' AS kind, user_id AS id, name FROM company_users WHERE company_id=ANY($1::text[]) AND deleted=false
    UNION SELECT DISTINCT 'distributor',d.id,d.name FROM distributor_companies dc JOIN distributors d ON d.id=dc.distributor_id WHERE dc.company_id=ANY($1::text[])
    UNION SELECT DISTINCT 'client',c.id,c.name FROM company_clients cc JOIN clients c ON c.id=cc.client_id WHERE cc.company_id=ANY($1::text[])
    ORDER BY name`, [ids]);
  return rows.map(row => ({ ...row, key: `${row.kind}:${row.id}` }));
});
