import { assertNoBillReceipts } from './bill-receipts'
import { prismaSqlClient } from './prisma-sql-client'

/** Hold bill ownership through cleanup so collections cannot race the check. */
export async function protectReceiptBills(tx: any, companyId: string, ids: string[]) {
  const db = prismaSqlClient(tx)
  await db.query('SELECT id FROM bills WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY id FOR UPDATE',[companyId,ids])
  for (const id of [...ids].sort()) await assertNoBillReceipts(db,companyId,id,true)
}
