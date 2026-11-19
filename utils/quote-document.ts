/** Only public image URLs and CDN object keys are usable on a document. */
export function quoteDocumentImage(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\\]/.test(value)) return ''
  const image = value.trim()
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image)) return image
  if (/^https:\/\//i.test(image)) {
    try { const url = new URL(image); return url.username || url.password ? '' : url.href } catch { return '' }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(image) || image.startsWith('//') || image.split('/').includes('..')) return ''
  return 'https://images.markit.co.in/' + image.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
}
export function quoteDocumentAddress(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (value.formattedAddress || value.formatted_address) return String(value.formattedAddress || value.formatted_address).trim()
  return [...new Set([
    value.houseDetails || value.house_details, value.street, value.locality, value.landmark,
    [value.city, value.state, value.pincode].filter(Boolean).join(', '),
  ].filter(Boolean).map(part => String(part).trim()))].join('\n')
}
