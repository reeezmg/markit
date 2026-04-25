import { defineEventHandler, readBody } from 'h3'

function normalizePhone(phone: string) {
  const cleaned = String(phone || '').replace(/\D/g, '')
  return cleaned.startsWith('91') ? cleaned : `91${cleaned.slice(-10)}`
}

function formatCouponDiscount(coupon: any) {
  if (coupon?.type === 'PERCENTAGE') {
    const max = coupon.maxDiscountAmount ? ` max ${coupon.maxDiscountAmount}` : ''
    return `${coupon.discountValue || 0}% off${max}`
  }
  if (coupon?.type === 'FLAT') return `${coupon.discountValue || 0} off`
  return 'Gift coupon'
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { phone, name, companyName, coupons } = body

  if (!phone) return { success: false, message: 'Phone is required' }
  if (!Array.isArray(coupons) || coupons.length === 0) {
    return { success: true, skipped: true }
  }

  const formattedPhone = normalizePhone(phone)
  const couponLines = coupons
    .map((coupon: any, index: number) => {
      const validTill = coupon.endDate ? `, valid till ${new Date(coupon.endDate).toLocaleDateString('en-IN')}` : ''
      return `${index + 1}. ${coupon.code || coupon.couponNumber} (${formatCouponDiscount(coupon)}${validTill})`
    })
    .join('\n')

  const message = [
    `Hi ${name || 'Customer'},`,
    `You earned ${coupons.length} coupon${coupons.length > 1 ? 's' : ''} from ${companyName || 'Markit'}.`,
    couponLines,
    'Show this coupon code/barcode at billing to redeem.',
  ].join('\n\n')

  try {
    const res: any = await $fetch(
      `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: message,
          },
        },
      },
    )

    return { success: true, to: formattedPhone, data: res }
  } catch (error: any) {
    console.error('WhatsApp coupon message error:', JSON.stringify(error?.data || error.message, null, 2))
    return { success: false, error: error?.data || error.message }
  }
})
