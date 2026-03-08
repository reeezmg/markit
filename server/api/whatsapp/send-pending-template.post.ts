import { defineEventHandler, readBody } from 'h3'

const formatDate = (date: string) => {
  if (!date) return ''
  try {
    const [year, month, day] = date.split('T')[0].split('-')
    return `${day}/${month}/${year}`
  } catch {
    return date
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const {
    phone,
    name,
    billName,
    amount,
    receiptId,
    } = body || {}

  if (!phone) {
    return { success: false, message: 'Phone is required' }
  }

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
            name: 'pending_invoice_1',
            language: { code: 'en_US' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: String(name || '') },
                  { type: 'text', text: String(billName || '') },
                  { type: 'text', text: String(amount || '') },
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

    return { success: true, to: formattedPhone, data: res }
  } catch (error: any) {
    console.error('WhatsApp Pending Template Error:', JSON.stringify(error?.data, null, 2))
    return { success: false, error: error?.data || error.message }
  }
})

