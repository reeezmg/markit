export type ShippingRow = Record<string, any>
export type ShippingDB = { query: (sql: string, params?: any[]) => Promise<{ rows: ShippingRow[]; rowCount?: number | null }> }
const dimensions = ['weight', 'length', 'width', 'height']
const complete = (box: ShippingRow) => dimensions.every(key => box[key] != null && Number.isFinite(Number(box[key])))
export function itemName(item: ShippingRow) {
  const options = [item.size ? `${item.sizeLabel || 'Size'}: ${item.size}` : '', item.shade ? `Shade: ${item.shade}` : ''].filter(Boolean)
  return `${item.name || item.variantName || 'Item'}${options.length ? ` (${options.join(' · ')})` : ''}`
}
export async function resolveOrderLines(db: ShippingDB, companyId: string, items: ShippingRow[]) {
  const ids = [...new Set(items.map(i => i.itemId).filter(Boolean))]
  const rows = ids.length ? (await db.query(`SELECT i.id AS item_id,
    sbi.weight AS iw,sbi.length AS il,sbi.width AS iwd,sbi.height AS ih,
    sbp.weight AS pw,sbp.length AS pl,sbp.width AS pwd,sbp.height AS ph
    FROM items i JOIN variants v ON v.id=i.variant_id AND v.company_id=i.company_id
    JOIN products p ON p.id=v.product_id AND p.company_id=i.company_id
    LEFT JOIN shipping_boxes sbi ON sbi.id=i.dimension_id AND sbi.company_id=i.company_id
    LEFT JOIN shipping_boxes sbp ON sbp.id=p.dimension_id AND sbp.company_id=i.company_id
    WHERE i.company_id=$1 AND i.id=ANY($2::text[])`, [companyId, ids])).rows : []
  const byId = new Map(rows.map(r => [r.item_id, r]))
  const lines = items.map(item => {
    const r = byId.get(item.itemId) || {}
    const own = { weight: r.iw, length: r.il, width: r.iwd, height: r.ih }
    const product = { weight: r.pw, length: r.pl, width: r.pwd, height: r.ph }
    const source = complete(own) ? 'item' : complete(product) ? 'product' : null
    return { name: itemName(item), qty: Math.trunc(Number(item.quantity || item.qty || 1)),
      ...(source === 'item' ? own : source === 'product' ? product : { weight: null, length: null, width: null, height: null }),
      resolved: !!source, source }
  })
  return { lines, allResolved: lines.every(l => l.resolved) }
}
const round = (n: number) => Math.round(n * 1000) / 1000
const volume = (b: ShippingRow) => Number(b.length) * Number(b.width) * Number(b.height)
export function pickBoxes(lines: ShippingRow[], boxes: ShippingRow[]) {
  const resolved = lines.filter(l => l.resolved)
  const productWeight = round(resolved.reduce((n, l) => n + Number(l.weight) * l.qty, 0))
  const empty = { boxes: [] as ShippingRow[], boxCount: 0, productWeight, boxWeight: 0, totalWeight: productWeight, hasBox: false, error: null as string | null }
  let remaining = resolved.reduce((n, l) => n + volume(l) * l.qty, 0)
  const valid = boxes.filter(b => ['length', 'width', 'height'].every(k => Number(b[k]) > 0)).sort((a, b) => volume(a) - volume(b))
  if (!valid.length || remaining <= 0) return empty
  const biggest = valid[valid.length - 1]!
  const limits = [biggest.length, biggest.width, biggest.height].map(Number).sort((a, b) => a - b)
  const oversized = resolved.filter(l => [l.length, l.width, l.height].map(Number).sort((a, b) => a - b).some((n, i) => n > limits[i]! + 1e-9))
  if (oversized.length) return { ...empty, error: `Too large for the biggest box (${biggest.name}): ${oversized.slice(0, 3).map(l => l.name || 'item').join(', ')}` }
  const chosen: ShippingRow[] = []
  while (remaining > 1e-9 && chosen.length < 200) {
    const box = valid.find(b => volume(b) >= remaining) || biggest
    chosen.push(box)
    remaining -= volume(box)
  }
  if (remaining > 1e-9) return { ...empty, error: 'Order needs more than 200 boxes — split it into separate shipments' }
  const boxWeight = round(chosen.reduce((n, b) => n + Number(b.weight || 0), 0))
  return { boxes: chosen, boxCount: chosen.length, productWeight, boxWeight, totalWeight: round(productWeight + boxWeight), hasBox: true, error: null }
}
