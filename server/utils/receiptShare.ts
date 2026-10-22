import { createHmac, timingSafeEqual } from 'node:crypto';
import { createError } from 'h3';

function secret() {
  const value = process.env.RECEIPT_SHARE_SECRET || process.env.NUXT_SESSION_SECRET || process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw createError({ statusCode: 503, statusMessage: 'Receipt sharing needs a configured signing secret' });
  return value;
}
export function createReceiptShare(billId: string, companyId: string, now = Date.now(), documentKey?: string) {
  const payload = Buffer.from(JSON.stringify({ billId, companyId, expires: now + 30 * 24 * 60 * 60 * 1000, ...(documentKey && { documentKey }) })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update('receipt-share:' + payload).digest('base64url')}`;
}
export function verifyReceiptShare(token: string, now = Date.now()): { billId: string; companyId: string; expires: number; documentKey?: string } {
  const invalid = () => createError({ statusCode: 404, statusMessage: 'Receipt link is invalid or expired' });
  if (token.length > 2000) throw invalid();
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) throw invalid();
  const expected = createHmac('sha256', secret()).update('receipt-share:' + payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid();
  let value: any;
  try { value = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw invalid(); }
  if (typeof value.billId !== 'string' || !value.billId || typeof value.companyId !== 'string' || !value.companyId || !Number.isFinite(value.expires) || value.expires <= now) throw invalid();
  if (value.documentKey !== undefined && (typeof value.documentKey !== 'string' || !value.documentKey.startsWith(`receipts/${encodeURIComponent(value.companyId)}/${encodeURIComponent(value.billId)}/`) || !/\/[a-f0-9-]+\.pdf$/.test(value.documentKey))) throw invalid();
  return value;
}
