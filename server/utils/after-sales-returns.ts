import { afterSalesAvailable, serviceLock, serviceError, cancelCustomerProducts, serviceAudit } from './after-sales-lifecycle'

/** Adapter keeps source/after-sales writes inside Accountant's existing Prisma transaction. */
export function afterSalesPgAdapter(prisma: any) {
  return { async query(sql: string, args: any[] = []) {
    if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql) && !/RETURNING/i.test(sql)) return { rows: [], rowCount: await prisma.$executeRawUnsafe(sql, ...args) }
    const rows = await prisma.$queryRawUnsafe(sql, ...args)
    return { rows, rowCount: rows.length }
  } }
}
export async function returnOrderServiceUnits(db: any, companyId: string, orderId: string, items: {entryId:string;qty:number}[], ids: string[], actor: string) {
  if (!await afterSalesAvailable(db)) return
  await serviceLock(db, companyId)
  const all = (await db.query("SELECT * FROM customer_products WHERE company_id=$1 AND order_id=$2 AND status='ACTIVE'", [companyId, orderId])).rows
  const selected = all.filter((p: any) => ids.includes(p.id))
  if (selected.length !== new Set(ids).size || selected.some((p:any)=>!items.some(i=>i.entryId===p.entry_id))) throw serviceError('Select returned units from this ecommerce order.', 400)
  for (const item of items) if (all.some((p: any) => p.entry_id === item.entryId) && selected.filter((p: any) => p.entry_id === item.entryId).length !== item.qty) throw serviceError('Select the specific client units physically received for each covered return item.', 400)
  await cancelCustomerProducts(db, companyId, ids, actor, 'Ecommerce return physically received', 'RETURNED')
  for(const id of ids) await serviceAudit(db,companyId,id,actor,'ORDER_RETURN','Ecommerce return physically received',null,{orderId})
}
