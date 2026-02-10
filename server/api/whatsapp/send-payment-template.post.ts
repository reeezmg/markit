import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const {
    phone,        // Customer phone with country code
    name,         // {{1}}
    billName,     // {{2}}
    amount,       // {{3}}
    paymentDate,  // {{4}}
    receiptId     // For button URL
  } = body

  if (!phone) {
    return { success: false, message: 'Phone is required' }
  }

  const url = `https://markit.co.in/receipt/${receiptId}`

  try {
    const res: any = await $fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: 'bill_payment_received', // Your template name
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: name },
                  { type: 'text', text: billName },
                  { type: 'text', text: amount },
                  { type: 'text', text: paymentDate }
                ]
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [
                  {
                    type: 'text',
                    text: receiptId
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
      data: res
    }
  } catch (error: any) {
    console.error(error?.data || error)
    return {
      success: false,
      error: error?.data || error.message
    }
  }
})
