/** Keep default inventory valuation and Billing's selected Stock account together. */
export async function selectErpStockAccount(db:any, companyId:string, accountId:string) {
  const table = await db.query("SELECT to_regclass('accountant_v2_stock_control')::text AS name");
  if (!table.rows[0]?.name) return;
  const changed = await db.query(`UPDATE accountant_v2_stock_control SET stock_account_id=$2,updated_at=now()
    WHERE company_id=$1 AND stock_account_id<>$2 RETURNING enabled`, [companyId, accountId]);
  if (changed.rows[0]?.enabled) await db.query('SELECT accountant_v2_sync_stock($1)', [companyId]);
}
