import { randomUUID } from 'node:crypto'
import { itemName, type ShippingRow } from './cartonization'
import { carrierRequest, shippingError, withQuery, type CarrierFetch } from './http'

/** Preserve the existing non-Delhivery transports; do not advertise unimplemented operations. */
export async function legacyCarrier(fetcher: CarrierFetch, provider: string, gw: ShippingRow, operation: 'create' | 'track' | 'cancel', b: ShippingRow): Promise<any> {
  const request = (url: string, method = 'GET', body?: any, headers: Record<string, string> = {}, query: ShippingRow = {}) =>
    carrierRequest(fetcher, withQuery(url, query), { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, 15000)
  const awb = encodeURIComponent(b.awb || ''), cod = String(b.paymentMethod).toUpperCase() === 'COD', items = b.items || []
  const qty = items.reduce((s: number, i: any) => s + Number(i.quantity || 1), 0), desc = items.map(itemName).join(', ')
  if (provider === 'shiprocket') {
    const base = 'https://apiv2.shiprocket.in/v1/external'
    const login = await request(base + '/auth/login', 'POST', { email: gw.email || '', password: gw.password || '' }), auth = { Authorization: `Bearer ${login.token || ''}` }
    if (operation === 'cancel') return { provider, success: true, response: await request(base + '/orders/cancel', 'POST', b.orderId ? { ids: [b.orderId] } : { awbs: [b.awb] }, auth) }
    if (operation === 'track') {
      const data = (await request(base + `/courier/track/awb/${awb}`, 'GET', undefined, auth)).tracking_data || {}
      return { provider, awb: b.awb, status: data.shipment_status, tracking: data }
    }
    const data = await request(base + '/orders/create/adhoc', 'POST', { order_id: b.orderNumber, order_date: new Date().toISOString().slice(0, 16).replace('T', ' '), pickup_location: 'Primary',
      billing_customer_name: b.customerName, billing_phone: b.customerPhone, billing_email: b.customerEmail || '', billing_address: b.deliveryAddress,
      billing_city: b.deliveryCity, billing_state: b.deliveryState, billing_pincode: b.deliveryPincode, billing_country: b.deliveryCountry, shipping_is_billing: true,
      payment_method: cod ? 'COD' : 'Prepaid', sub_total: b.totalAmount, length: b.length, breadth: b.width, height: b.height, weight: b.weight,
      order_items: items.map((i: any) => ({ name: itemName(i), sku: i.sku || randomUUID().slice(0, 8), units: i.quantity ?? 1, selling_price: i.price || 0 })) }, auth)
    return { provider, shipmentId: data.shipment_id, orderId: data.order_id, awb: data.awb_code, courierName: data.courier_name, label: data.label_url }
  }
  if (operation === 'cancel') throw shippingError(`Cancel not yet implemented for provider: ${provider}`)
  if (provider === 'ecomexpress') {
    const query = { username: gw.username || '', password: gw.password || '' }
    if (operation === 'track') return { provider, awb: b.awb, tracking: await request('https://clbeta.ecomexpress.in/apiv2/track_me/', 'GET', undefined, {}, { ...query, awb: b.awb }) }
    const data = await request('https://clbeta.ecomexpress.in/services/shipment/v2/awbassign/', 'POST', undefined, {}, { ...query, json_input: JSON.stringify([{
      AWB_NUMBER: '', ORDER_NUMBER: b.orderNumber, PRODUCT: cod ? 'COD' : 'PPD', CONSIGNEE: b.customerName, CONSIGNEE_ADDRESS1: b.deliveryAddress, CONSIGNEE_CITY: b.deliveryCity,
      CONSIGNEE_STATE: b.deliveryState, CONSIGNEE_PINCODE: b.deliveryPincode, CONSIGNEE_MOBILE: b.customerPhone, ITEM_DESCRIPTION: desc, PIECES: qty, WEIGHT: b.weight * 1000, AMOUNT: cod ? b.codAmount : 0 }]) })
    return { provider, response: data }
  }
  if (provider === 'xpressbees') {
    const base = 'https://ship.xpressbees.com/api', login = await request(base + '/users/login', 'POST', { email: gw.clientId || '', password: gw.clientSecret || '' }), auth = { Authorization: `Bearer ${login.data?.token || ''}` }
    if (operation === 'track') { const data = await request(base + `/shipments2/track/${awb}`, 'GET', undefined, auth); return { provider, awb: b.awb, status: data.data?.status, tracking: data } }
    const data = await request(base + '/shipments2', 'POST', { order_number: b.orderNumber, shipping_charges: 0, discount: 0, cash_on_delivery: b.codAmount, payment_type: cod ? 'cod' : 'prepaid',
      package_weight: b.weight * 1000, package_length: b.length, package_breadth: b.width, package_height: b.height,
      consignee: { name: b.customerName, address: b.deliveryAddress, city: b.deliveryCity, state: b.deliveryState, pincode: b.deliveryPincode, phone: b.customerPhone },
      order_items: items.map((i: any) => ({ name: itemName(i), qty: i.quantity ?? 1, price: i.price || 0 })) }, auth)
    return { provider, awb: data.data?.awb_number, response: data }
  }
  if (provider === 'shadowfax') {
    const base = 'https://logistics.shadowfax.in/api/v1', auth = { Authorization: `Token ${gw.apiKey || ''}` }
    if (operation === 'track') { const data = await request(base + '/tracking/', 'GET', undefined, auth, { order_id: b.awb }); return { provider, trackingId: b.awb, status: data.status, tracking: data } }
    const data = await request(base + '/order/', 'POST', { client_order_id: b.orderNumber, client_code: gw.clientCode || '', deliver_to: b.customerName, address: b.deliveryAddress,
      city: b.deliveryCity, state: b.deliveryState, pincode: b.deliveryPincode, contact: b.customerPhone, payment_mode: cod ? 'COD' : 'PREPAID', amount_to_collect: b.codAmount }, auth)
    return { provider, orderId: data.id, trackingId: data.tracking_id, response: data }
  }
  if (provider === 'dtdc') {
    const base = 'https://dtdcapi.dtdc.com/dtdc/ext'
    if (operation === 'track') return { provider, awb: b.awb, tracking: await request(base + '/track.json', 'GET', undefined, {}, { customerCode: gw.customerCode || '', trackType: 'S', trackVal: b.awb }) }
    const data = await request(base + '/service_type.json', 'POST', { customerCode: gw.customerCode || '', apiKey: gw.apiKey || '', refNo: b.orderNumber, addType: 'D', consignee: b.customerName,
      address: b.deliveryAddress, pinCode: b.deliveryPincode, city: b.deliveryCity, state: b.deliveryState, mobile: b.customerPhone, amt: b.codAmount, pdtType: 'NON-DOCUMENT', shipType: cod ? 'COD' : 'PREPAID' })
    return { provider, trackingNo: data.trackingNo, response: data }
  }
  if (provider === 'pickrr') {
    const base = 'https://pickrr.com/api-v5'
    if (operation === 'track') { const data = await request(base + '/shipment/track/', 'GET', undefined, {}, { p_token: gw.authToken || '', tracking_id: b.awb }); return { provider, trackingId: b.awb, status: data.current_status, tracking: data } }
    const data = await request(base + '/shipment/create/', 'POST', { auth_token: gw.authToken || '', item_name: desc, from_name: 'Store', from_pincode: gw.facilityCode || '', to_name: b.customerName,
      to_pincode: b.deliveryPincode, to_city: b.deliveryCity, to_state: b.deliveryState, to_address: b.deliveryAddress, to_phone_number: b.customerPhone, quantity: qty,
      invoice_value: b.totalAmount, payment_mode: cod ? 'COD' : 'PREPAID', cod_amount: b.codAmount, weight: b.weight, client_order_id: b.orderNumber })
    return { provider, trackingId: data.tracking_id, awb: data.awb, response: data }
  }
  if (provider === 'dunzo') {
    const base = gw.environment === 'TEST' ? 'https://staging.dunzo.com/api/v1' : 'https://api.dunzo.com/api/v1'
    const login = await request(base + '/token/', 'POST', { client_id: gw.clientId || '', client_secret: gw.clientSecret || '' }), auth = { Authorization: `Bearer ${login.token?.access_token || ''}`, 'client-id': gw.clientId || '' }
    if (operation === 'track') { const data = await request(base + `/task/${awb}/status/`, 'GET', undefined, auth); return { provider, taskId: b.awb, status: data.state, tracking: data } }
    const data = await request(base + '/task/', 'POST', { request_id: b.orderNumber, pickup_details: [{ reference_id: b.orderNumber, address: { address_line_1: 'Store Address' } }],
      delivery_details: [{ reference_id: b.orderNumber, address: { address_line_1: b.deliveryAddress, city: b.deliveryCity }, contact_details: { name: b.customerName, phone_number: b.customerPhone } }], payment_method: cod ? 'CASH' : 'ONLINE' }, auth)
    return { provider, taskId: data.id, response: data }
  }
  if (provider === 'ekart') {
    const base = 'https://api.ekartlogistics.com/v1', auth = { 'x-api-key': gw.apiKey || '' }
    if (operation === 'track') { const data = await request(base + `/shipments/${awb}/track`, 'GET', undefined, auth); return { provider, awb: b.awb, status: data.status, tracking: data } }
    const data = await request(base + '/shipments', 'POST', { orderNumber: b.orderNumber, consignee: { name: b.customerName, phone: b.customerPhone, address: b.deliveryAddress, city: b.deliveryCity, state: b.deliveryState, pincode: b.deliveryPincode },
      paymentMode: cod ? 'COD' : 'PREPAID', codAmount: b.codAmount, declaredValue: b.totalAmount, weight: b.weight * 1000 }, { ...auth, 'x-seller-code': gw.sellerCode || '' })
    return { provider, awb: data.awb, response: data }
  }
  if (provider === 'speedpost' && operation === 'track') return { provider, awb: b.awb, tracking: await request('https://trackingapi.indiapost.gov.in/api/v1/track', 'GET', undefined, {}, { awbNo: b.awb }) }
  throw shippingError(`${operation} not supported for provider: ${provider}`)
}
