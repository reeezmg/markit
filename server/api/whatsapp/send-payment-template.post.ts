import { defineEventHandler, readBody, createError } from 'h3'
import { getReadCompanyId } from '~/server/utils/organizationReadScope'
import { verifyReceiptShare } from '~/server/utils/receiptShare'

// ✅ Safe date formatter (DD/MM/YYYY)
const formatDate = (date: string) => {
  if (!date) return ''

  try {
    const [year, month, day] = date.split('T')[0].split('-')
    return `${day}/${month}/${year}`
  } catch {
    return date // fallback if format unexpected
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const companyId = await getReadCompanyId(event, body?.companyId)
  // Only send PDF links issued for a bill in the authorized company.
  const receiptPath = typeof body?.receiptId === 'string' ? body.receiptId : ''
  const [billId, query] = receiptPath.split('?')
  const params = new URLSearchParams(query)
  const share = verifyReceiptShare(params.get('share') || '')
  if (share.companyId !== companyId || encodeURIComponent(share.billId) !== billId || !share.documentKey || params.get('pdf') !== '1') {
    throw createError({ statusCode: 400, statusMessage: 'A stored receipt PDF link is required' })
  }

  const {
    phone,
    name,
    billName,
    amount,
    paymentDate,
    receiptId
  } = body

  // ❌ Validate phone
  if (!phone) {
    return { success: false, message: 'Phone is required' }
  }

  // ✅ Clean + normalize phone number
  const cleaned = String(phone).replace(/\D/g, '')

  const formattedPhone = cleaned.startsWith('91')
    ? cleaned
    : `91${cleaned.slice(-10)}`

  try {
    const res: any = await $fetch(
      `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'template',
          template: {
            name: 'invoice_1',
            language: { code: 'en_US' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: String(name || '') },
                  { type: 'text', text: String(billName || '') },
                  { type: 'text', text: String(amount || '') },
                  { type: 'text', text: formatDate(paymentDate) } // ✅ formatted
                ]
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [
                  {
                    type: 'text',
                    text: String(receiptId || '')
                  }
                ]
              }
            ]
          }
        }
      }
    )

    return {
      success: true,
      to: formattedPhone,
      data: res
    }
  } catch (error: any) {
    console.error('WhatsApp Error:', JSON.stringify(error?.data, null, 2))

    return {
      success: false,
      error: error?.data || error.message
    }
  }
})
