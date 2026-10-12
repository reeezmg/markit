import { pool } from '../db';

export async function loadSelectedAccounts(companyId: string) {
  const { rows } = await pool.query(`SELECT DISTINCT ON ("resourceId") "resourceId", "after"
    FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='account-defaults'
      AND action='configured' AND deleted_at IS NULL
    ORDER BY "resourceId",created_at DESC,id DESC`, [companyId]);
  const mappings = await pool.query(`SELECT 'erp' AS kind,accounts FROM accountant_v2_erp_settings WHERE company_id=$1
    UNION ALL SELECT 'staff',accounts FROM accountant_v2_user_settings WHERE company_id=$1
    UNION ALL SELECT 'ecommerce',accounts FROM accountant_v2_ecommerce_settings WHERE company_id=$1`, [companyId]);
  return { companyId, version: 2, defaults: {
    ...Object.fromEntries(rows.map(row => [row.resourceId, row.after || {}])),
    ...Object.fromEntries(mappings.rows.map(row => [row.kind, row.accounts || {}])),
  } };
}
