import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

function key(secret: string) {
  if (secret.length < 32) throw new Error('WHATSAPP_ENCRYPTION_KEY must contain at least 32 characters')
  return createHash('sha256').update(`markit:whatsapp:v1:${secret}`).digest()
}
export function sealToken(token: string, secret: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(secret), iv)
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}
export function openToken(token: string, secret: string) {
  const [v, iv, tag, data] = token.split('.')
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Invalid WhatsApp credential')
  const cipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64url'))
  cipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8')
}
export function validSignature(raw: string, signature: string, secret: string) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false
  const expected = createHmac('sha256', secret).update(raw).digest()
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))
}
export function normalizeRecipient(value: unknown) {
  const phone = String(value || '').replace(/[+\s()-]/g, '')
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter a full international number, including country code')
  return phone
}
export function validateTemplate(raw: any) {
  if (!/^[a-z][a-z0-9_]{0,511}$/.test(raw.name || '')) throw new Error('Template name must use lowercase letters, numbers and underscores')
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(raw.language || '')) throw new Error('Enter a Meta language code such as en_US')
  if (!['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(raw.category)) throw new Error('Choose a template category')
  if (!Array.isArray(raw.components) || !raw.components.length || JSON.stringify(raw.components).length > 40000) throw new Error('Template components are required (maximum 40 KB)')
  return { name: raw.name, language: raw.language, category: raw.category, components: raw.components }
}
