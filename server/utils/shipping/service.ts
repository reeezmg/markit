import { randomUUID } from 'node:crypto'
import { pickBoxes, resolveOrderLines, type ShippingDB, type ShippingRow } from './cartonization'
import { createDelhivery, editableStatuses } from './delhivery'
import { shippingError, type CarrierFetch } from './http'
import { legacyCarrier } from './legacy-carriers'

export type ShippingOptions = { method: 'GET' | 'POST'; path: string; query?: ShippingRow; body?: any }
export const statusRank: Record<string, number> = { PLACED: 0, PACKED: 1, MANIFESTED: 2, NOT_PICKED: 3, PICKED: 4, SHIPPED: 5, OUT_FOR_DELIVERY: 6, UNDELIVERED: 7, RTO: 8, RTO_DELIVERED: 9, DELIVERED: 10, PICKUP_SCHEDULED: 11, OUT_FOR_PICKUP: 12, RETURNING: 13, RETURNED: 14, CANCELLED: 99 }
export function canAdvance(from: string, to: string) {
  if (['DELIVERED', 'CANCELLED'].includes(from) || !(to in statusRank)) return false
  return (statusRank[to] || 0) > (statusRank[from] || 0) || (from === 'UNDELIVERED' && ['OUT_FOR_DELIVERY', 'SHIPPED'].includes(to)) || (from === 'NOT_PICKED' && to === 'MANIFESTED')
}
const json = (value: any) => typeof value === 'string' ? JSON.parse(value) : value || {}
const money = (value: any) => Math.round(Number(value || 0) * 100) / 100
const csv = (value: any) => String(value || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 50)
function required(value: any, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw shippingError(`${name} is required`)
  return value.trim()
}

/** Company scope is supplied by the authenticated Nuxt handler, never by the body. */
export function createShippingService(db: ShippingDB, companyId: string, fetcher: CarrierFetch = globalThis.fetch,
  delivered: (db: ShippingDB, companyId: string, orderId: string) => Promise<void> = async () => {}) {
  const carrier = createDelhivery(fetcher)
  const rows = async (sql: string, params: any[] = []) => (await db.query(sql, params)).rows
  const one = async (sql: string, params: any[] = []) => (await rows(sql, params))[0]
  const tx = async <T>(fn: () => Promise<T>) => {
    await db.query('BEGIN')
    try { const result = await fn(); await db.query('COMMIT'); return result }
    catch (error) { await db.query('ROLLBACK'); throw error }
  }
  async function preference(key: string) {
    const row = await one(`SELECT preference_value FROM general_preferences WHERE company_id=$1 AND page_name='ecomm_shipping' AND preference_key=$2 LIMIT 1`, [companyId, key])
    return row ? row.preference_value : null
  }
  async function savePreference(key: string, value: any) {
    await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
      VALUES($1,$2,'ecomm_shipping',$3,$4::jsonb,true) ON CONFLICT(company_id,page_name,preference_key)
      DO UPDATE SET preference_value=EXCLUDED.preference_value,active=true`, [randomUUID(), companyId, key, JSON.stringify(value)])
  }
  async function config(optional = false) {
    const value = await preference('provider_config')
    if (value == null && !optional) throw shippingError('Shipping not configured', 404)
    return json(value)
  }
  async function active(capability?: string, hint?: string) {
    const cfg = await config(), provider = hint || cfg.primary || '', gw = cfg.providers?.[provider] || {}
    if (!provider) throw shippingError('No primary shipping provider set')
    if (!gw.enabled) throw shippingError(`Provider '${provider}' is not connected`)
    if (capability && (provider !== 'delhivery' || !carrier.capabilities.includes(capability))) throw shippingError(`${capability} not supported for provider: ${provider}`)
    return { cfg, provider, gw }
  }
  async function labelSize() {
    const value = await preference('label_size'), size = typeof value === 'string' ? value : value?.size
    return ['A4', '4R'].includes(size) ? size : 'A4'
  }
  async function pickup() {
    return await one(`SELECT * FROM ecomm_pickup_locations WHERE company_id=$1 AND active=true
      ORDER BY registered_with_carrier DESC NULLS LAST,is_default DESC,created_at ASC LIMIT 1`, [companyId]) || {}
  }
  async function seller() {
    const company = await one('SELECT name FROM companies WHERE id=$1 LIMIT 1', [companyId])
    const location = await one(`SELECT address,city,state,pincode FROM ecomm_pickup_locations WHERE company_id=$1 AND active=true ORDER BY is_default DESC,created_at ASC LIMIT 1`, [companyId]) || {}
    return { name: String(company?.name || '').trim(), address: [location.address, location.city, location.state, location.pincode].filter(Boolean).join(', ') }
  }
  const boxes = () => rows(`SELECT name,weight,length,width,height FROM shipping_boxes WHERE company_id=$1 AND type='box'`, [companyId])
  const orderSelect = `SELECT eo.id,eo.order_number AS "orderNumber",eo.status,eo.meta,eo.payment_method AS "paymentMethod",eo.grand_total AS "grandTotal",eo.items,
    COALESCE(NULLIF(eo.shipping_address,'{}'::jsonb),NULLIF(ec.shipping_address,'{}'::jsonb)) AS "shippingAddress"
    FROM ecomm_orders eo LEFT JOIN ecomm_checkouts ec ON ec.id=eo.checkout_id AND ec.company_id=eo.company_id WHERE eo.company_id=$1`
  async function orderById(id: string, forUpdate = false) {
    const order = await one(orderSelect + ` AND (eo.id=$2 OR eo.order_number::text=$2) LIMIT 1${forUpdate ? ' FOR UPDATE OF eo' : ''}`, [companyId, id])
    if (!order) throw shippingError('Order not found', 404)
    return order
  }
  function idFilter(ids: any, start = 2) {
    if (ids === undefined || ids === null) return { clause: '', params: [] }
    if (!Array.isArray(ids) || ids.length > 1000 || ids.some(v => typeof v !== 'string' || !v)) throw shippingError('orderIds must be an array of up to 1000 IDs')
    return { clause: ` AND (eo.id=ANY($${start}::text[]) OR eo.order_number::text=ANY($${start}::text[]))`, params: [ids] }
  }
  async function unshipped(ids: any) {
    const f = idFilter(ids)
    return rows(orderSelect + ` AND eo.meta->>'awb' IS NULL AND eo.status NOT IN ('CANCELLED','DELIVERED')` + f.clause + ' ORDER BY eo.created_at DESC', [companyId, ...f.params])
  }
  async function shipped(ids: any) {
    const f = idFilter(ids)
    return rows(`SELECT eo.id,eo.order_number AS "orderNumber",eo.meta->>'awb' AS awb,eo.meta#>>'{shipping,labelUrl}' AS "labelUrl"
      FROM ecomm_orders eo WHERE eo.company_id=$1 AND eo.meta->>'awb' IS NOT NULL` + f.clause + ' ORDER BY eo.created_at DESC', [companyId, ...f.params])
  }
  async function ownedAwbs(awbs: string[]) {
    if (!awbs.length) throw shippingError('waybills is required')
    const records = await rows(`SELECT meta FROM ecomm_orders WHERE company_id=$1 AND (
      meta->>'awb'=ANY($2::text[]) OR meta#>>'{shipping,awb}'=ANY($2::text[]) OR meta#>>'{shipping,reverse,awb}'=ANY($2::text[])
      OR meta#>>'{shipping,exchange,awb}'=ANY($2::text[]) OR (meta#>'{shipping,childAwbs}') ?| $2::text[])`, [companyId, awbs])
    const owned = new Set(records.flatMap(r => { const m = r.meta || {}, s = m.shipping || {}; return [m.awb, s.awb, s.reverse?.awb, s.exchange?.awb, ...(s.childAwbs || [])].filter(Boolean).map(String) }))
    if (awbs.some(awb => !owned.has(awb))) throw shippingError('Shipment not found', 404)
  }
  async function previewOrder(order: ShippingRow, available: ShippingRow[], pickupName: string) {
    const { lines, allResolved } = await resolveOrderLines(db, companyId, order.items || [])
    const address = order.shippingAddress || {}, reasons = [], cart = pickBoxes(allResolved ? lines : [], available)
    if (!allResolved) reasons.push('Missing weight/dimensions on some items')
    if (!address.pincode || !(address.phoneNo || address.phone)) reasons.push('Incomplete delivery address')
    if (!pickupName) reasons.push('No registered pickup location')
    if (cart.error) reasons.push(cart.error)
    const awb = order.meta?.awb, ewbn = order.meta?.shipping?.ewbn, ewaybillRequired = Number(order.grandTotal || 0) > 50000
    if (awb) reasons.push(`Already shipped (AWB ${awb})`)
    if (['CANCELLED', 'DELIVERED'].includes(order.status)) reasons.push(`Order is ${order.status.toLowerCase()}`)
    if (ewaybillRequired && !ewbn) reasons.push('E-way bill required for orders over Rs 50,000 — generate it on the GST portal and enter the number')
    return { orderId: order.id, orderNumber: order.orderNumber, canShip: reasons.length === 0, alreadyShipped: !!awb, ewaybillRequired, ewaybill: ewbn || null,
      reason: reasons.join('; ') || null, totalWeight: cart.totalWeight, boxCount: cart.boxCount, boxes: cart.boxes.map(b => b.name), productWeight: cart.productWeight, boxWeight: cart.boxWeight, lines }
  }
  async function persistLabel(awb: string, url: string) {
    await db.query(`UPDATE ecomm_orders SET meta=jsonb_set(COALESCE(meta,'{}'::jsonb),'{shipping,labelUrl}',$3::jsonb,true),updated_at=now()
      WHERE company_id=$1 AND meta->>'awb'=$2`, [companyId, awb, JSON.stringify(url)])
  }
  async function takeWaybills(gw: ShippingRow, count: number) {
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['shipping-waybills:' + companyId])
    const pool = json(await preference('waybill_pool')), available = [...new Set<string>((pool.delhivery || []).filter(Boolean))]
    if (available.length < count) available.push(...(await carrier.waybills(gw, Math.max(50, count))).filter(w => !available.includes(w)))
    if (available.length < count) throw shippingError(`Only ${available.length} waybill(s) available for a ${count}-box shipment. Try again shortly.`)
    const taken = available.splice(0, count)
    pool.delhivery = available
    await savePreference('waybill_pool', pool)
    return taken
  }
  function shipmentBody(order: ShippingRow, location: ShippingRow, cart: ShippingRow, info: ShippingRow) {
    const a = order.shippingAddress || {}, paymentMethod = String(order.paymentMethod).toUpperCase() === 'COD' ? 'COD' : 'Prepaid'
    return { orderId: order.id, orderNumber: String(order.orderNumber || order.id), customerName: `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.name || 'Customer',
      customerPhone: a.phoneNo || a.phone || '', customerEmail: '', deliveryAddress: a.formattedAddress || [a.houseDetails, a.street, a.locality, a.landmark].filter(Boolean).join(', '),
      deliveryCity: a.city || '', deliveryState: a.state || '', deliveryPincode: String(a.pincode || ''), deliveryCountry: a.country || 'India', items: order.items || [],
      weight: cart.totalWeight, length: cart.boxes[0]?.length ?? 10, width: cart.boxes[0]?.width ?? 10, height: cart.boxes[0]?.height ?? 10,
      paymentMethod, totalAmount: money(order.grandTotal), codAmount: paymentMethod === 'COD' ? money(order.grandTotal) : 0,
      pickupLocation: String(location.name || '').trim(), sellerName: info.name, sellerAddress: info.address,
      productsDesc: (order.items || []).map((i: any) => i.name || i.variantName || '').filter(Boolean).join(', ').slice(0, 200) || 'Merchandise',
      ewaybillNumber: order.meta?.shipping?.ewbn || order.meta?.ewbn, hsnCode: order.hsnCode }
  }
  async function shipOne(id: string, gw: ShippingRow, available: ShippingRow[], location: ShippingRow, info: ShippingRow) {
    const outcome = await tx(async () => {
      // Serialize concurrent create clicks before making a non-idempotent carrier call.
      const target = await orderById(id)
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['shipping-order:' + companyId + ':' + target.id])
      const order = await orderById(target.id, true), preview = await previewOrder(order, available, String(location.name || '').trim())
      if (!preview.canShip) throw shippingError(preview.reason || 'Order cannot be shipped')
      const { lines } = await resolveOrderLines(db, companyId, order.items || []), cart = pickBoxes(lines, available)
      const body = shipmentBody(order, location, cart, info)
      const waybills = cart.boxCount > 1 ? await takeWaybills(gw, cart.boxCount) : []
      let result: ShippingRow
      try {
        result = waybills.length ? await carrier.mps(gw, body, cart.boxes, waybills) : await carrier.create(gw, body)
      } catch (error) {
        if (!waybills.length) throw error
        // Commit the restored pool so newly fetched, unused AWBs are not lost
        // when a carrier rejects a multi-piece manifest.
        const pool = json(await preference('waybill_pool'))
        pool.delhivery = [...new Set([...waybills, ...(pool.delhivery || [])])]
        await savePreference('waybill_pool', pool)
        return { error, result: null }
      }
      if (!result.awb) throw shippingError('Carrier did not return a waybill')
      const shipping = { ...(order.meta?.shipping || {}), provider: 'delhivery', awb: String(result.awb), trackingId: String(result.awb), childAwbs: result.childAwbs || [],
        status: result.status, location: body.pickupLocation, boxCount: cart.boxCount, boxes: cart.boxes.map(b => b.name), totalWeight: cart.totalWeight }
      await db.query(`UPDATE ecomm_orders SET meta=COALESCE(meta,'{}'::jsonb)||$3::jsonb,updated_at=now() WHERE company_id=$1 AND id=$2`, [companyId, order.id, JSON.stringify({ awb: String(result.awb), shipping })])
      return { error: null, result: { orderId: order.id, orderNumber: order.orderNumber, ok: true, awb: result.awb, boxCount: cart.boxCount, boxes: cart.boxes.map(b => b.name), totalWeight: cart.totalWeight, labelUrl: null as string | null } }
    })
    if (outcome.error) throw outcome.error
    return outcome.result!
  }
  async function attachLabels(gw: ShippingRow, results: ShippingRow[]) {
    const size = await labelSize(), good = results.filter(r => r.ok && r.awb), urls: ShippingRow = {}
    for (let start = 0; start < good.length; start += 50) {
      const batch = good.slice(start, start + 50)
      try {
        const data = await carrier.labels(gw, batch.map(r => r.awb), size)
        for (const pkg of data.packages || []) if (pkg.pdf_download_link) urls[String(pkg.wbn || pkg.waybill)] = pkg.pdf_download_link
        if (batch.length === 1 && data.pdf_download_link) urls[batch[0]!.awb] = data.pdf_download_link
      } catch { /* individual fallback below */ }
      for (const result of batch) {
        if (!urls[result.awb]) { try { urls[result.awb] = (await carrier.label(gw, result.awb, size)).labelUrl } catch { /* shipment still exists */ } }
        result.labelUrl = urls[result.awb] || null
        if (result.labelUrl) await persistLabel(result.awb, result.labelUrl)
      }
    }
  }
  async function history(orderId: string, status: string, source: string, awb: string, raw: string | null = null, note: string | null = null) {
    await db.query(`INSERT INTO ecomm_order_status_history(id,company_id,order_id,status,raw_status,source,note,awb) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), companyId, orderId, status, raw, source, note, awb])
  }
  async function settle(orderId: string) {
    await delivered(db, companyId, orderId)
    const order = await one(`SELECT checkout_id,bill_id FROM ecomm_orders WHERE company_id=$1 AND id=$2 AND status='DELIVERED' AND UPPER(COALESCE(payment_method,''))='COD' FOR UPDATE`, [companyId, orderId])
    if (!order) return
    await db.query(`UPDATE ecomm_orders SET payment_status='PAID',updated_at=now() WHERE company_id=$1 AND id=$2 AND payment_status='PENDING'`, [companyId, orderId])
    if (order.checkout_id) await db.query(`UPDATE ecomm_checkouts SET payment_status='PAID',status='PAID',updated_at=now() WHERE company_id=$1 AND id=$2 AND UPPER(COALESCE(payment_method,''))='COD' AND payment_status='PENDING'`, [companyId, order.checkout_id])
    if (order.bill_id) await db.query(`UPDATE bills SET payment_status='PAID',updated_at=now() WHERE company_id=$1 AND id=$2 AND UPPER(COALESCE(payment_method,''))='COD' AND payment_status='PENDING'`, [companyId, order.bill_id])
  }
  async function syncTracking(statuses: ShippingRow) {
    let synced = 0
    for (const [awb, info] of Object.entries(statuses)) {
      if (!info) continue
      try {
        await tx(async () => {
          const order = await one(`SELECT id,status FROM ecomm_orders WHERE company_id=$1 AND meta->>'awb'=$2 FOR UPDATE`, [companyId, awb])
          if (!order) return
          const detail = { rawStatus: info.rawStatus, statusType: info.statusType, nslCode: info.nslCode, instructions: info.instructions, ndrAttempts: info.ndrAttempts, at: new Date().toISOString() }
          await db.query(`UPDATE ecomm_orders SET meta=COALESCE(meta,'{}'::jsonb)||$3::jsonb,updated_at=now() WHERE company_id=$1 AND id=$2`, [companyId, order.id, JSON.stringify({ carrier: detail })])
          if (!canAdvance(order.status, info.status)) return
          await db.query(`UPDATE ecomm_orders SET status=$3,meta=COALESCE(meta,'{}'::jsonb)||$4::jsonb,updated_at=now() WHERE company_id=$1 AND id=$2`, [companyId, order.id, info.status, JSON.stringify({ shippingStatus: info.status, shippingRawStatus: info.rawStatus })])
          await history(order.id, info.status, 'track', awb, info.rawStatus)
          if (info.status === 'DELIVERED') await settle(order.id)
          synced++
        })
      } catch { /* Keep carrier reads available if local bookkeeping fails. */ }
    }
    return synced
  }
  async function assertEditable(gw: ShippingRow, awb: string, action: string) {
    let info
    try { info = await carrier.track(gw, awb) } catch { return }
    if (info.status && !editableStatuses.includes(String(info.status).trim().toLowerCase())) throw shippingError(`${action} is not allowed once the shipment is '${info.status}' — the carrier permits it only while it is Manifested, In Transit, Pending, Scheduled.`)
  }
  async function customerFlow(b: ShippingRow, exchange: boolean) {
    const { gw } = await active(exchange ? 'exchange' : 'reverse'), type = exchange ? 'exchange' : 'return', key = exchange ? 'exchangeAwb' : 'reverseAwb'
    return tx(async () => {
      const request = await one(`SELECT id,order_id,type,status,items,meta FROM ecomm_order_requests WHERE company_id=$1 AND id=$2 FOR UPDATE`, [companyId, required(b.requestId, 'requestId')])
      if (!request) throw shippingError(`${type} request not found`, 404)
      if (request.type !== type) throw shippingError(`This endpoint is only for ${type} requests`)
      if (String(request.status).toUpperCase() !== 'APPROVED') throw shippingError(`Approve the ${type} request first`)
      if (request.meta?.[key]) throw shippingError('A shipment already exists for this request')
      const order = await orderById(request.order_id)
      const wh = await one(`SELECT * FROM ecomm_pickup_locations WHERE company_id=$1 AND active=true AND registered_with_carrier=true ORDER BY is_default DESC,created_at ASC LIMIT 1`, [companyId])
      if (!wh) throw shippingError('No carrier-registered pickup location — register a warehouse first')
      const a = order.shippingAddress || {}, items = request.items || order.items || []
      const body: ShippingRow = { orderNumber: `${order.orderNumber}-${exchange ? 'REPL' : 'RVP'}-${request.id.slice(0, 8)}`,
        customerName: [a.firstName, a.lastName].filter(Boolean).join(' ') || a.name || 'Customer', customerPhone: a.phoneNo || a.phone || '',
        customerAddress: [a.houseDetails, a.street, a.locality, a.landmark].filter(Boolean).join(', ') || a.formattedAddress || '',
        customerCity: a.city || '', customerState: a.state || '', customerPincode: a.pincode || '', customerCountry: a.country || 'India',
        returnName: wh.contact_name || wh.name, returnPhone: wh.phone || '', returnAddress: wh.address || '', returnCity: wh.city || '', returnState: wh.state || '', returnCountry: wh.country || 'India', returnPincode: wh.pincode || '',
        pickupLocation: wh.name, totalAmount: order.grandTotal, productsDesc: items.map((i: any) => i.name || i.variantName || 'Item').join(', '),
        quantity: items.reduce((s: number, i: any) => s + Number(i.quantity || i.qty || 1), 0) || 1, weight: b.weight || (order.meta?.shipping?.totalWeight ? Math.round(Number(order.meta.shipping.totalWeight) * 1000) : null) }
      const result = await carrier.customerFlow(gw, body, exchange)
      const meta = { awb: result.awb, requestId: request.id, at: new Date().toISOString(), status: result.status }
      await db.query(`UPDATE ecomm_orders SET meta=jsonb_set(jsonb_set(COALESCE(meta,'{}'::jsonb),'{shipping}',COALESCE(meta->'shipping','{}'::jsonb),true),$3::text[],$4::jsonb,true),updated_at=now() WHERE company_id=$1 AND id=$2`, [companyId, order.id, ['shipping', exchange ? 'exchange' : 'reverse'], JSON.stringify(meta)])
      await db.query(`UPDATE ecomm_order_requests SET meta=COALESCE(meta,'{}'::jsonb)||$3::jsonb,updated_at=now() WHERE company_id=$1 AND id=$2`, [companyId, request.id, JSON.stringify({ [key]: result.awb })])
      return result
    })
  }
  async function pdf(awb: string) {
    await ownedAwbs([awb])
    const { gw } = await active('label')
    const stored = await one(`SELECT meta#>>'{shipping,labelUrl}' AS url FROM ecomm_orders WHERE company_id=$1 AND meta->>'awb'=$2 LIMIT 1`, [companyId, awb])
    async function download(url: string) {
      // Only carrier-generated URLs are used; do not accept a URL from the browser.
      let response = await fetcher(url, { headers: { Accept: 'application/pdf' }, signal: AbortSignal.timeout(30000) })
      if ([401, 403].includes(response.status)) response = await fetcher(url, { headers: { ...carrier.auth(gw), Accept: 'application/pdf' }, signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw shippingError('Could not download carrier label', 502)
      const body = Buffer.from(await response.arrayBuffer())
      if (body.subarray(0, 5).toString() !== '%PDF-') throw shippingError('Carrier did not return a PDF label', 502)
      return { body, contentType: 'application/pdf' }
    }
    if (stored?.url) { try { return await download(stored.url) } catch { /* expired URL: regenerate */ } }
    const fresh = (await carrier.label(gw, awb, await labelSize())).labelUrl
    if (!fresh) throw shippingError(`No label available for AWB ${awb}`, 404)
    await persistLabel(awb, fresh)
    return download(fresh)
  }

  async function run(opts: ShippingOptions): Promise<any> {
    const path = opts.path, q = opts.query || {}, b = opts.body || {}, parts = path.split('/').map(decodeURIComponent)
    if (opts.method === 'GET' && path === 'providers') {
      const cfg = await config(true), primary = cfg.primary || '', priority = (cfg.priority || []).filter(Boolean), providers = cfg.providers || {}
      const order = [...new Set<string>([...(priority.length ? priority : primary ? [primary] : []), ...Object.keys(providers)])]
      return { providers: order.filter(id => providers[id]?.enabled).map(id => ({ id, label: id === 'delhivery' ? 'Delhivery' : id, capabilities: id === 'delhivery' ? [...carrier.capabilities].sort() : [], supportsPickup: id === 'delhivery', isPrimary: id === primary })), priority: priority.length ? priority : primary ? [primary] : [], primary }
    }
    if (path === 'label-size') {
      if (opts.method === 'POST') { const size = ['A4', '4R'].includes(b.size) ? b.size : 'A4'; await savePreference('label_size', size); return { size } }
      return { size: await labelSize() }
    }
    if (opts.method === 'GET' && parts[0] === 'order' && parts[2] === 'preview') {
      const order = await orderById(required(parts[1], 'orderId')), available = await boxes(), location = await pickup()
      return { pickupLocation: String(location.name || '').trim(), boxesConfigured: available.length, order: await previewOrder(order, available, String(location.name || '').trim()) }
    }
    if (opts.method === 'POST' && path === 'bulk-preview') {
      const available = await boxes(), location = await pickup(), previews = []
      for (const order of await unshipped(b.orderIds)) previews.push(await previewOrder(order, available, String(location.name || '').trim()))
      return { pickupLocation: String(location.name || '').trim(), boxesConfigured: available.length, total: previews.length, shippable: previews.filter(p => p.canShip).length, orders: previews }
    }
    if (opts.method === 'POST' && ((parts[0] === 'order' && parts[2] === 'create') || path === 'bulk-create')) {
      const { gw } = await active('create'), available = await boxes(), location = await pickup(), info = await seller()
      if (path !== 'bulk-create') { const result = await shipOne(required(parts[1], 'orderId'), gw, available, location, info); await attachLabels(gw, [result]); return result }
      const results: ShippingRow[] = []
      for (const order of await unshipped(b.orderIds)) {
        try { results.push(await shipOne(order.id, gw, available, location, info)) }
        catch (e: any) { results.push({ orderId: order.id, orderNumber: order.orderNumber, ok: false, error: e.statusMessage || e.message }) }
      }
      await attachLabels(gw, results)
      const labels = results.filter(r => r.ok && r.labelUrl).map(r => ({ orderNumber: r.orderNumber, awb: r.awb, labelUrl: r.labelUrl }))
      return { created: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results, labels, labelCount: labels.length }
    }
    if (opts.method === 'GET' && path === 'serviceability') { const { gw } = await active('serviceability'); return carrier.serviceability(gw, required(q.pincode, 'pincode')) }
    if (opts.method === 'GET' && (parts[0] === 'track' || path === 'track-bulk')) {
      const awbs = parts[0] === 'track' ? [required(parts[1], 'trackingId')] : csv(q.waybills)
      await ownedAwbs(awbs)
      const { provider, gw } = await active(undefined, q.provider_hint)
      if (parts[0] === 'track') return provider === 'delhivery' ? carrier.track(gw, awbs[0]!) : legacyCarrier(fetcher, provider, gw, 'track', { awb: awbs[0] })
      if (provider !== 'delhivery') return { statuses: {} }
      const statuses = await carrier.trackBulk(gw, awbs)
      // Ignore unexpected AWBs returned by a carrier batch.
      for (const awb of Object.keys(statuses)) if (!awbs.includes(awb)) delete statuses[awb]
      return { statuses, synced: await syncTracking(statuses) }
    }
    if (opts.method === 'POST' && path === 'cancel') {
      const { provider, gw } = await active(), awb = required(b.awb, 'awb')
      await ownedAwbs([awb])
      if (provider !== 'delhivery') return legacyCarrier(fetcher, provider, gw, 'cancel', b)
      await assertEditable(gw, awb, 'Cancellation')
      const result = await carrier.cancel(gw, b)
      await tx(async () => {
        const order = await one(`SELECT id,meta FROM ecomm_orders WHERE company_id=$1 AND (meta->>'awb'=$2 OR meta#>>'{shipping,awb}'=$2) FOR UPDATE`, [companyId, awb])
        if (!order) return
        const meta = { ...order.meta }, s = meta.shipping || {}, cancelled = [...(s.cancelled || []), { awb, provider: s.provider, labelUrl: s.labelUrl, at: new Date().toISOString() }]
        delete meta.awb; meta.shipping = { cancelled }
        await db.query(`UPDATE ecomm_orders SET meta=$3::jsonb,status='PACKED',updated_at=now() WHERE company_id=$1 AND id=$2`, [companyId, order.id, JSON.stringify(meta)])
        await history(order.id, 'PACKED', 'shipment-cancelled', awb, null, `Shipment ${awb} cancelled`)
      })
      return { ...result, released: true }
    }
    if (opts.method === 'POST' && path === 'update') { const { gw } = await active('update'); const awb = required(b.awb, 'awb'); await ownedAwbs([awb]); await assertEditable(gw, awb, 'Editing'); return carrier.update(gw, b) }
    if (opts.method === 'POST' && path === 'ewaybill') {
      const ewbn = required(b.ewbn, 'E-waybill number'), order = await orderById(required(b.orderId, 'orderId'))
      const invoice = await one(`SELECT b.invoice_number FROM ecomm_orders eo LEFT JOIN bills b ON b.id=eo.bill_id AND b.company_id=eo.company_id WHERE eo.company_id=$1 AND eo.id=$2`, [companyId, order.id])
      const dcn = b.invoiceNumber || invoice?.invoice_number || (order.orderNumber ? `ORD-${order.orderNumber}` : null)
      if (!dcn) throw shippingError('No invoice number for this order — Delhivery requires one with the e-waybill')
      const awb = order.meta?.awb
      if (awb) { const { gw } = await active('ewaybill'); await carrier.ewaybill(gw, awb, String(dcn), ewbn) }
      await db.query(`UPDATE ecomm_orders SET meta=jsonb_set(jsonb_set(COALESCE(meta,'{}'::jsonb),'{shipping}',COALESCE(meta->'shipping','{}'::jsonb),true),'{shipping,ewbn}',$3::jsonb,true),updated_at=now() WHERE company_id=$1 AND id=$2`, [companyId, order.id, JSON.stringify(ewbn)])
      return { ok: true, ewbn, dcn, awb: awb || null, pushedToCarrier: !!awb, required: Number(order.grandTotal) > 50000 }
    }
    if (opts.method === 'POST' && path === 'pickup') {
      const { gw } = await active('pickup', b.provider)
      const name = required(b.pickupLocation, 'pickupLocation')
      const location = await one(`SELECT id FROM ecomm_pickup_locations WHERE company_id=$1 AND name=$2 AND active=true AND registered_with_carrier=true`, [companyId, name])
      if (!location) throw shippingError('Registered pickup location not found', 404)
      required(b.pickupDate, 'pickupDate')
      return carrier.pickup(gw, b)
    }
    if (opts.method === 'POST' && path === 'ndr') {
      const { gw } = await active('ndr'), awb = required(b.awb, 'awb'); await ownedAwbs([awb])
      const result = await carrier.ndr(gw, b)
      if (result.uplId) {
        await db.query(`UPDATE ecomm_orders SET meta=jsonb_set(jsonb_set(jsonb_set(COALESCE(meta,'{}'::jsonb),'{shipping}',COALESCE(meta->'shipping','{}'::jsonb),true),'{shipping,ndr}',COALESCE(meta#>'{shipping,ndr}','{}'::jsonb),true),'{shipping,ndr,upl}',$3::jsonb,true),updated_at=now()
          WHERE company_id=$1 AND (meta->>'awb'=$2 OR meta#>>'{shipping,awb}'=$2 OR meta#>>'{shipping,reverse,awb}'=$2 OR meta#>>'{shipping,exchange,awb}'=$2)`, [companyId, awb, JSON.stringify({ id: String(result.uplId), action: b.action, at: new Date().toISOString() })])
      }
      return result
    }
    if (opts.method === 'GET' && path === 'ndr-status') {
      const { gw } = await active('ndr'), upl = required(q.uplId, 'uplId')
      if (!await one(`SELECT id FROM ecomm_orders WHERE company_id=$1 AND meta#>>'{shipping,ndr,upl,id}'=$2 LIMIT 1`, [companyId, upl])) throw shippingError('NDR request not found', 404)
      return carrier.ndrStatus(gw, upl)
    }
    if (opts.method === 'POST' && ['reverse', 'exchange'].includes(path)) return customerFlow(b, path === 'exchange')
    if (opts.method === 'POST' && parts[0] === 'pickup-locations' && parts[2] === 'register') {
      const { provider, gw } = await active('pickup_location'), id = required(parts[1], 'locationId')
      const location = await one(`SELECT * FROM ecomm_pickup_locations WHERE company_id=$1 AND id=$2 LIMIT 1`, [companyId, id])
      if (!location) throw shippingError('Pickup location not found', 404)
      const name = String(location.name || '').trim(), registered = location.carrier_meta?.registeredName || location.carrier_meta?.data?.name
      if (location.registered_with_carrier && registered && registered !== name) throw shippingError(`This warehouse is registered with Delhivery as '${registered}'. Delhivery cannot rename a warehouse — revert the name, or add a new pickup location under the new name.`)
      const result = await carrier.location(gw, location, !!location.registered_with_carrier), meta = { ...result.carrierMeta, registeredName: name }
      await db.query(`UPDATE ecomm_pickup_locations SET registered_with_carrier=true,carrier=$3,carrier_meta=$4::jsonb,name=$5,updated_at=now() WHERE company_id=$1 AND id=$2`, [companyId, id, provider, JSON.stringify(meta), name])
      return { ok: true, registered: true, provider, carrierMeta: meta }
    }
    if (opts.method === 'GET' && path === 'label-data') {
      const { gw } = await active('label'), awbs = csv(q.waybills); await ownedAwbs(awbs)
      const size = await labelSize(), info = await seller(), raw = await carrier.labels(gw, awbs, size, false)
      if (!raw.packages?.length) throw shippingError('No label data for that waybill', 404)
      return { size, seller: info, packages: raw.packages.map((p: any) => ({ ...p, snm: String(p.snm || '').trim() ? p.snm : info.name, sadd: String(p.sadd || '').trim() ? p.sadd : info.address })) }
    }
    if (opts.method === 'GET' && parts[0] === 'label' && parts[2] === 'pdf') return pdf(required(parts[1], 'trackingId'))
    if (opts.method === 'GET' && parts[0] === 'label') {
      const awb = required(parts[1], 'trackingId'); await ownedAwbs([awb]); const { gw } = await active('label')
      const result = await carrier.label(gw, awb, await labelSize()); if (result.labelUrl) await persistLabel(awb, result.labelUrl); return result
    }
    if (opts.method === 'POST' && path === 'bulk-label') {
      const { gw } = await active('label'), orders = await shipped(b.orderIds), results: ShippingRow[] = orders.map(o => ({ ...o, ok: true }))
      await attachLabels(gw, results)
      const labels = results.map(r => ({ orderId: r.id, orderNumber: r.orderNumber, awb: r.awb, labelUrl: r.labelUrl }))
      return { labels, count: labels.filter(l => l.labelUrl).length, size: await labelSize() }
    }
    if (opts.method === 'POST' && path === 'labels/zip') {
      const orders = await shipped(b.orderIds)
      if (!orders.length) throw shippingError('No shipped orders with a label', 404)
      const files: { name: string; body: Buffer }[] = [], errors = []
      for (const order of orders) {
        const name = `order-${order.orderNumber || 'label'}-${order.awb}.pdf`.replace(/[^\w.-]/g, '-')
        try { files.push({ name, body: (await pdf(order.awb)).body }) } catch (e: any) { errors.push(`${name}: ${e.statusMessage || e.message}`) }
      }
      if (!files.length) throw shippingError(errors.join('; ') || 'No labels could be downloaded', 502)
      if (errors.length) files.push({ name: 'errors.txt', body: Buffer.from(errors.join('\n')) })
      const { zipFiles } = await import('./zip')
      return { body: zipFiles(files), contentType: 'application/zip' }
    }
    if (opts.method === 'POST' && path === 'create') {
      const { provider, gw } = await active()
      for (const field of ['orderId', 'orderNumber', 'customerName', 'customerPhone', 'deliveryAddress', 'deliveryCity', 'deliveryState', 'deliveryPincode']) required(b[field], field)
      const body = { weight: 0.5, length: 10, width: 10, height: 10, deliveryCountry: 'India', paymentMethod: 'Prepaid', codAmount: 0, totalAmount: 0, ...b }
      if (!Array.isArray(body.items)) throw shippingError('items is required')
      return tx(async () => {
        const target = await orderById(b.orderId)
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['shipping-order:' + companyId + ':' + target.id])
        const order = await orderById(target.id, true)
        if (order.meta?.awb) throw shippingError('Order already has a shipment')
        if (['CANCELLED', 'DELIVERED'].includes(order.status)) throw shippingError(`Order is ${order.status.toLowerCase()}`)
        const result = provider === 'delhivery' ? await carrier.create(gw, body) : await legacyCarrier(fetcher, provider, gw, 'create', body)
        const awb = result.awb || result.trackingId || result.shipmentId
        if (awb) await db.query(`UPDATE ecomm_orders SET meta=COALESCE(meta,'{}'::jsonb)||$3::jsonb,updated_at=now() WHERE company_id=$1 AND id=$2`, [companyId, order.id,
          JSON.stringify({ awb: String(awb), shipping: { ...(order.meta?.shipping || {}), provider, awb: String(awb), trackingId: String(result.trackingId || awb), status: result.status, location: b.pickupLocation || null } })])
        return result
      })
    }
    throw shippingError('Shipping operation not found', 404)
  }
  return { run }
}
