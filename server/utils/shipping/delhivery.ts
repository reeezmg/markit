import { carrierError, carrierRequest, shippingError, withQuery, type CarrierFetch } from './http'
import type { ShippingRow } from './cartonization'

export const delhiveryCapabilities = ['rates', 'create', 'track', 'cancel', 'serviceability', 'update', 'label', 'pickup', 'pickup_location', 'ndr', 'mps', 'reverse', 'exchange', 'ewaybill']
export const editableStatuses = ['manifested', 'in transit', 'pending', 'scheduled']
const clean = (value: any) => String(value || '').replace(/[&#%;\\]/g, ' ').replace(/\s+/g, ' ').trim()
export function normalizeStatus(raw: string, type = ''): string | null {
  const s = String(raw || '').trim().toLowerCase(), st = String(type || '').toUpperCase()
  if (st === 'DL') return s.includes('rto') ? 'RTO_DELIVERED' : s.includes('dto') ? 'RETURNED' : 'DELIVERED'
  if (st === 'RT') return s.includes('delivered') && !s.includes('undelivered') ? 'RTO_DELIVERED' : 'RTO'
  if (st === 'PP') return s.includes('dispatched') ? 'OUT_FOR_PICKUP' : 'PICKUP_SCHEDULED'
  if (st === 'PU') return 'RETURNING'
  if (st === 'CN') return 'CANCELLED'
  if (!s) return null
  if (s.includes('rto')) return s.includes('delivered') ? 'RTO_DELIVERED' : 'RTO'
  if (s.includes('dto')) return 'RETURNED'
  if (['undelivered', 'not delivered', 'failed delivery'].some(k => s.includes(k))) return 'UNDELIVERED'
  if (st === 'UD' && s.includes('pending')) return 'SHIPPED'
  if (s.includes('delivered')) return 'DELIVERED'
  if (s.includes('out for delivery') || s.includes('dispatched')) return 'OUT_FOR_DELIVERY'
  if (s.includes('not picked')) return 'NOT_PICKED'
  if (s.includes('manifested')) return 'MANIFESTED'
  if (s.includes('in transit') || s.includes('in-transit')) return 'SHIPPED'
  if (['picked up', 'pickup complete', 'out for pickup picked'].some(k => s.includes(k))) return 'PICKED'
  if (s.includes('cancel')) return 'CANCELLED'
  return null
}
export function shipmentError(data: any) {
  const remarks = (data?.packages || []).flatMap((p: any) => Array.isArray(p.remarks) ? p.remarks : p.remarks ? [p.remarks] : [])
    .map((r: any) => String(r).replace(/^Crashing while saving package due to exception\s*'?(.+?)'?\.?\s*(Package might have been partially saved\.?)?$/i, '$1')
      .replace(/(\d{6})\s+is non serviceable pincode/i, 'Pincode $1 is not serviceable by Delhivery'))
  if (data?.rmk && !(remarks.length && /internal error has occurred/i.test(data.rmk))) remarks.push(String(data.rmk))
  return [...new Set(remarks)].join('; ') || carrierError(data, 'Delhivery rejected the shipment')
}
export function createDelhivery(fetcher: CarrierFetch = globalThis.fetch) {
  const base = 'https://track.delhivery.com'
  const auth = (gw: ShippingRow) => ({ Authorization: `Token ${gw.apiToken || ''}` })
  const request = (gw: ShippingRow, path: string, method = 'GET', body?: any, query?: ShippingRow, timeout = 20000) =>
    carrierRequest(fetcher, withQuery(base + path, query || {}), { method, headers: { ...auth(gw), Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }, timeout)
  const edit = async (gw: ShippingRow, body: any, action: string) => {
    const data = await request(gw, '/api/p/edit', 'POST', body)
    if (String(data?.status || '').toLowerCase() === 'failure' || data?.error || data?.remarks)
      throw shippingError(typeof data.error === 'string' && data.error.trim() ? data.error : `${action} was refused by Delhivery`)
    return { provider: 'delhivery', success: true, response: data }
  }
  const create = async (gw: ShippingRow, shipments: any[], pickup: string, master?: string) => {
    // Delhivery create.json requires this literal body; cancel/edit use ordinary JSON.
    const data = await request(gw, '/api/cmu/create.json', 'POST', 'format=json&data=' + JSON.stringify({ shipments, pickup_location: pickup ? { name: pickup } : {} }), undefined, 30000)
    const packages = data?.packages || [], pkg = packages[0] || {}
    if (!pkg.waybill || (master && !packages.some((p: any) => String(p.waybill) === master))) throw shippingError(shipmentError(data))
    return { provider: 'delhivery', awb: String(master || pkg.waybill), refNumber: pkg.refnum, status: pkg.status, remarks: pkg.remarks, response: data }
  }
  const adapter = {
    id: 'delhivery', displayName: 'Delhivery', capabilities: delhiveryCapabilities, auth,
    async rates(gw: ShippingRow, b: ShippingRow) {
      return { provider: 'delhivery', rates: await request(gw, '/api/kinko/v1/invoice/charges/.json', 'GET', undefined,
        { md: 'S', cgm: Math.trunc(Number(b.weight || 0.5) * 1000), o_pin: b.pickupPincode, d_pin: b.deliveryPincode, ss: 'Delivered', pt: Number(b.codAmount) > 0 ? 'COD' : 'Pre-paid', cod: b.codAmount || 0 }) }
    },
    async create(gw: ShippingRow, b: ShippingRow) {
      const pickup = String(b.pickupLocation || gw.warehouseCode || '').trim()
      const shipment: ShippingRow = { name: clean(b.customerName), phone: b.customerPhone, add: clean(b.deliveryAddress), city: clean(b.deliveryCity), state: clean(b.deliveryState),
        pin: b.deliveryPincode, country: b.deliveryCountry || 'India', payment_mode: String(b.paymentMethod).toUpperCase() === 'COD' ? 'COD' : 'Prepaid', cod_amount: b.codAmount || 0,
        order: b.orderNumber, total_amount: b.totalAmount, weight: Math.round(Number(b.weight || 0) * 1000) || 1, seller_inv: b.orderNumber,
        quantity: (b.items || []).reduce((n: number, i: any) => n + Number(i.quantity || 1), 0), pickup_location: pickup }
      for (const [src, dst] of Object.entries({ productsDesc: 'products_desc', sellerName: 'seller_name', sellerAddress: 'seller_add' })) if (b[src]) shipment[dst] = clean(b[src]).slice(0, src === 'productsDesc' ? 200 : undefined)
      for (const [src, dst] of Object.entries({ length: 'shipment_length', width: 'shipment_width', height: 'shipment_height', ewaybillNumber: 'ewbn', hsnCode: 'hsn_code' })) if (b[src] != null && b[src] !== '') shipment[dst] = b[src]
      if (gw.warehouseCode?.trim()) shipment.client = gw.warehouseCode.trim()
      return create(gw, [shipment], pickup)
    },
    async waybills(gw: ShippingRow, count: number): Promise<string[]> {
      const data = await request(gw, '/waybill/api/bulk/json/', 'GET', undefined, { count, token: gw.apiToken || '' })
      return (typeof data === 'string' ? data.split(',') : Array.isArray(data) ? data : []).map((v: any) => String(v).trim()).filter(Boolean)
    },
    async mps(gw: ShippingRow, b: ShippingRow, boxes: ShippingRow[], waybills: string[]) {
      const n = boxes.length, master = waybills[0]!, pickup = String(b.pickupLocation || gw.warehouseCode || '').trim(), cod = String(b.paymentMethod).toUpperCase() === 'COD'
      if (waybills.length < n) throw shippingError('Could not fetch enough waybills for MPS')
      const perBox = Math.max(Number(b.weight || 0) - boxes.reduce((s, box) => s + Number(box.weight || 0), 0), 0) / n
      const shipments = boxes.map((box, i) => ({ name: clean(b.customerName), add: clean(b.deliveryAddress), pin: b.deliveryPincode, city: clean(b.deliveryCity), state: clean(b.deliveryState), country: b.deliveryCountry,
        phone: b.customerPhone, order: String(b.orderNumber), payment_mode: cod ? 'COD' : 'Prepaid', cod_amount: cod && !i ? b.codAmount : 0,
        total_amount: b.totalAmount, waybill: waybills[i], master_id: master, mps_children: n, mps_amount: cod ? b.codAmount : 0,
        shipment_type: 'MPS', weight: Math.round((Number(box.weight || 0) + perBox) * 1000) || 1,
        shipment_length: box.length, shipment_width: box.width, shipment_height: box.height, products_desc: clean(b.productsDesc || 'Merchandise').slice(0, 200),
        quantity: (b.items || []).reduce((s: number, item: any) => s + Number(item.quantity || 1), 0) || n, shipping_mode: 'Surface', seller_inv: String(b.orderNumber),
        seller_name: clean(b.sellerName) || pickup, pickup_location: pickup, ...(b.ewaybillNumber ? { ewbn: String(b.ewaybillNumber) } : {}), ...(gw.warehouseCode?.trim() ? { client: gw.warehouseCode.trim() } : {}) }))
      const result = await create(gw, shipments, pickup, master)
      const accepted = new Set(result.response.packages.map((p: any) => String(p.waybill)))
      return { ...result, childAwbs: waybills.slice(1).filter(w => accepted.has(w)), waybills, boxCount: n, status: 'Manifested' }
    },
    async customerFlow(gw: ShippingRow, b: ShippingRow, exchange: boolean) {
      const pickup = String(b.pickupLocation || gw.warehouseCode || '').trim()
      const shipment: ShippingRow = { order: b.orderNumber, payment_mode: exchange ? 'REPL' : 'Pickup', cod_amount: 0, total_amount: b.totalAmount,
        products_desc: clean(b.productsDesc).slice(0, 200), quantity: b.quantity, pickup_location: pickup }
      for (const [src, dst] of Object.entries({ customerName: 'name', customerPhone: 'phone', customerAddress: 'add', customerCity: 'city', customerState: 'state', customerPincode: 'pin', customerCountry: 'country',
        returnName: 'return_name', returnPhone: 'return_phone', returnAddress: 'return_add', returnCity: 'return_city', returnState: 'return_state', returnCountry: 'return_country', returnPincode: 'return_pin' })) shipment[dst] = ['phone', 'pin', 'return_phone', 'return_pin'].includes(dst) ? b[src] : clean(b[src])
      if (gw.warehouseCode?.trim()) shipment.client = gw.warehouseCode.trim()
      if (b.weight) shipment.weight = b.weight
      return create(gw, [shipment], pickup)
    },
    async track(gw: ShippingRow, awb: string) {
      const data = await request(gw, '/api/v1/packages/json/', 'GET', undefined, { waybill: awb })
      return { provider: 'delhivery', awb, status: data?.ShipmentData?.[0]?.Shipment?.Status?.Status, tracking: data }
    },
    async trackBulk(gw: ShippingRow, awbs: string[]) {
      if (!awbs.length) return {}
      const data = await request(gw, '/api/v1/packages/json/', 'GET', undefined, { waybill: awbs.join(',') }, 25000)
      const out: ShippingRow = {}
      for (const entry of data?.ShipmentData || []) {
        const s = entry.Shipment || {}, awb = String(s.AWB || s.Waybill || ''), st = s.Status || {}, raw = st.Status, type = String(st.StatusType || '').toUpperCase()
        if (!awb) continue
        let nsl = String(st.StatusCode || st.NSLCode || '').toUpperCase()
        if (nsl === 'EOD-38') nsl = ''
        const scans = (s.Scans || []).map((v: any) => String(v.ScanDetail?.StatusCode || '').toUpperCase()).filter((v: string) => v.startsWith('EOD-') && v !== 'EOD-38')
        if (!nsl.startsWith('EOD-') && scans.length && /pending|undelivered|not delivered/i.test(raw || '')) nsl = scans[scans.length - 1]
        let status = raw ? normalizeStatus(raw, type) : null
        if ((!status || status === 'SHIPPED') && (s.ReverseInTransit || s.RTOStartedDate)) status = 'RTO'
        out[awb] = { status, rawStatus: raw, statusType: type || null, nslCode: nsl || null, instructions: st.Instructions, ndrAttempts: scans.length }
      }
      return out
    },
    async cancel(gw: ShippingRow, b: ShippingRow) { return edit(gw, { waybill: String(b.awb), cancellation: 'true' }, 'Cancellation') },
    async update(gw: ShippingRow, b: ShippingRow) {
      const fields: ShippingRow = { waybill: b.awb }
      for (const [src, dst] of Object.entries({ name: 'name', phone: 'phone', address: 'add', productsDesc: 'products_desc', length: 'shipment_length', width: 'shipment_width', height: 'shipment_height' })) if (b[src] != null && b[src] !== '') fields[dst] = b[src]
      if (b.weight != null && b.weight !== '') fields.gm = Math.round(Number(b.weight) * 1000) || 1
      if (b.paymentMode?.trim()) {
        fields.pt = b.paymentMode.toUpperCase() === 'COD' ? 'COD' : 'Pre-paid'
        if (fields.pt === 'COD') { if (b.codAmount == null || b.codAmount === '') throw shippingError('Switching to COD requires a COD amount'); fields.cod = b.codAmount }
      }
      if (Object.keys(fields).length === 1) throw shippingError('Nothing to update')
      return edit(gw, fields, 'Editing')
    },
    async serviceability(gw: ShippingRow, pincode: string) {
      const data = await request(gw, '/c/api/pin-codes/json/', 'GET', undefined, { filter_codes: pincode })
      const codes = data.delivery_codes || [], info = codes[0]?.postal_code || {}, yn = (v: any) => ['Y', 'YES', 'TRUE', '1'].includes(String(v).toUpperCase())
      return { provider: 'delhivery', pincode, serviceable: !!codes.length, prepaid: yn(info.pre_paid), cod: yn(info.cod), pickup: yn(info.pickup), remarks: info.remarks || (codes.length ? '' : 'Pincode not serviceable') }
    },
    async ewaybill(gw: ShippingRow, awb: string, dcn: string, ewbn: string) {
      const data = await request(gw, `/api/rest/ewaybill/${encodeURIComponent(awb)}/`, 'PUT', { data: [{ dcn: String(dcn), ewbn: String(ewbn) }] })
      if (data.success === false || String(data.status).toLowerCase() === 'failure' || data.error) throw shippingError(carrierError(data, 'Failed to update the e-waybill'))
      return { provider: 'delhivery', awb, ewbn, dcn, success: true, response: data }
    },
    async labels(gw: ShippingRow, awbs: string[], size: string, pdf = true) {
      return request(gw, '/api/p/packing_slip', 'GET', undefined, { wbns: awbs.join(','), pdf: String(pdf), pdf_size: size || 'A4' }, 30000)
    },
    async label(gw: ShippingRow, awb: string, size: string) {
      const raw = await adapter.labels(gw, [awb], size)
      return { provider: 'delhivery', awb, labelUrl: raw.packages?.[0]?.pdf_download_link || raw.pdf_download_link || null, raw }
    },
    async pickup(gw: ShippingRow, b: ShippingRow) {
      const data = await request(gw, '/fm/request/new/', 'POST', { pickup_location: String(b.pickupLocation || '').trim(), pickup_date: b.pickupDate, pickup_time: b.pickupTime || '12:00:00', expected_package_count: b.expectedPackageCount ?? 1 })
      const pickupId = String(data?.pickup_id || '').trim()
      // Delhivery can return HTTP 200 for a rejected request. A pickup exists
      // only when the carrier gives us its pickup_id; never turn a vague 200
      // response into a successful Markit-only request.
      if (data?.success === false) throw shippingError(carrierError(data, 'Failed to create pickup request'))
      if (!pickupId) {
        const detail = carrierError(data, '')
        throw shippingError(`Delhivery did not create the pickup request${detail ? `: ${detail}` : ''}`)
      }
      return { provider: 'delhivery', success: true, pickupId, response: data }
    },
    async location(gw: ShippingRow, b: ShippingRow, update: boolean) {
      const common = { name: String(b.name || '').trim(), address: b.address || '', pin: b.pincode || '', phone: b.phone || '' }
      const payload = update ? common : { ...common, email: b.email || '', city: b.city || '', country: b.country || 'India',
        return_address: b.return_address || b.address || '', return_pin: b.return_pincode || b.pincode || '', return_city: b.return_city || b.city || '', return_state: b.return_state || b.state || '', return_country: b.return_country || b.country || 'India' }
      const data = await request(gw, `/api/backend/clientwarehouse/${update ? 'edit' : 'create'}/`, 'POST', payload)
      if (update ? data.success === false : data.success !== true) throw shippingError(carrierError(data, `Failed to ${update ? 'update' : 'register'} pickup location`))
      return { provider: 'delhivery', registered: true, carrierMeta: data }
    },
    async ndr(gw: ShippingRow, b: ShippingRow) {
      const action = String(b.action || '').trim().toUpperCase()
      if (!['RE-ATTEMPT', 'PICKUP_RESCHEDULE'].includes(action)) throw shippingError('Delhivery NDR supports only: RE-ATTEMPT, PICKUP_RESCHEDULE')
      const data = await request(gw, '/api/p/update', 'POST', { data: [{ waybill: b.awb, act: action, ...(b.extra || {}) }] })
      return { provider: 'delhivery', success: true, uplId: data.request_id || data.upl_id || data.UPL || null, response: data }
    },
    async ndrStatus(gw: ShippingRow, upl: string) { return { provider: 'delhivery', uplId: upl, response: await request(gw, `/api/cmu/get_bulk_upl/${encodeURIComponent(upl)}`, 'GET', undefined, { verbose: 'true' }) } },
  }
  return adapter
}
