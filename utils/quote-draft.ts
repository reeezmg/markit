import { z } from 'zod'
import { quoteStatuses, type QuoteInput } from './erp-quote'

export const quoteLocalKey = (kind: 'draft' | 'status', companyId: string, userId: string, document = 'quote') => `erp:${document}-${kind}:v1:${encodeURIComponent(companyId)}:${encodeURIComponent(userId || 'session')}`
const numeric = z.union([z.number().finite(), z.string().max(50)])
const text = z.string().max(10000)
const line = z.object({ id: text, variantId: text, name: text, description: text, barcode: text, size: text, unit: text,
  quantity: numeric, rate: numeric, discount: numeric, tax: numeric })
const draftSchema = z.object({
  version: z.literal(1), requestId: z.string().uuid(),
  form: z.object({ clientId: text, quoteDate: text, expiryDate: text, referenceNumber: text, subject: text,
    salesperson: text, status: z.enum([...quoteStatuses, 'CONFIRMED', 'CLOSED', 'CANCELLED']), notes: text, termsAndConditions: text, paymentTerms: text,
    deliveryEstimate: text, discount: numeric, discountType: z.enum(['amount', 'percent']), adjustment: numeric,
    pdfTemplate: z.enum(['classic', 'modern', 'compact']).optional(), hideZeroValueItems: z.boolean().optional(), items: z.array(line).min(1).max(500) }),
  customer: z.object({ id: text, name: text, phone: text }).nullable(),
  customerSearch: text, staffSearch: text, productSearch: text,
})
export type QuoteLocalDraft = { version: 1; requestId: string; form: QuoteInput; customer: { id: string; name: string; phone: string } | null; customerSearch: string; staffSearch: string; productSearch: string }
/** Drafts deliberately accept incomplete amounts and fields; source validation still runs on Save. */
export function readQuoteLocalDraft(raw: string | null, statuses: readonly string[] = quoteStatuses): QuoteLocalDraft | null {
  if (!raw || raw.length > 1000000) return null
  try {
    const value = draftSchema.parse(JSON.parse(raw))
    if (!statuses.includes(value.form.status)) return null
    if (value.customer?.id !== value.form.clientId && value.form.clientId) return null
    return value as unknown as QuoteLocalDraft
  } catch { return null }
}
