import { createError } from 'h3'

type StockEntry = { item_id: string | null; qty: number | string | null; return: boolean }

// A stock row can appear repeatedly, including as both a sale and a return.
export function billStockDeltas(entries: StockEntry[], restoring: boolean) {
  const deltas = new Map<string, number>()
  for (const entry of entries) {
    const qty = Number(entry.qty)
    if (!entry.item_id || !Number.isFinite(qty) || qty <= 0) continue
    const delta = qty * (entry.return ? -1 : 1) * (restoring ? 1 : -1)
    deltas.set(entry.item_id, (deltas.get(entry.item_id) || 0) + delta)
  }
  return [...deltas].map(([itemId, soldDelta]) => ({ itemId, soldDelta }))
}

// Caller must hold the bill's FOR UPDATE lock and own the transaction.
export async function applyBillStock(client: any, billId: string, companyId: string, restoring: boolean) {
  const entries = await client.query(
    'SELECT item_id, qty, return FROM entries WHERE bill_id = $1',
    [billId],
  )
  const deltas = billStockDeltas(entries.rows, restoring)
  if (!deltas.length) return

  // Lock in stable order, and refuse to silently skip missing/foreign stock rows.
  const ids = deltas.map(delta => delta.itemId)
  const stock = await client.query(
    `SELECT id FROM items WHERE id = ANY($1::text[]) AND company_id = $2
     ORDER BY id FOR UPDATE`,
    [ids, companyId],
  )
  if (stock.rowCount !== ids.length) {
    throw createError({ statusCode: 409, statusMessage: 'Bill stock items are missing or belong to another company' })
  }
  await client.query(
    `UPDATE items i
     SET sold_qty = COALESCE(i.sold_qty, 0) + d.sold_delta,
         qty = COALESCE(i.qty, 0) - d.sold_delta,
         updated_at = NOW()
     FROM unnest($1::text[], $2::double precision[]) AS d(item_id, sold_delta)
     WHERE i.id = d.item_id AND i.company_id = $3`,
    [ids, deltas.map(delta => delta.soldDelta), companyId],
  )
}
