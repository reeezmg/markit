// server/api/applyPromoCode.post.ts
import { defineEventHandler, readBody } from 'h3'
import { prisma } from '~/server/utils/prisma'   // wherever you export your ZenStack Prisma client

export default defineEventHandler(async (event) => {
  const { code } = await readBody<{ code: string }>(event)
  if (!code?.trim()) {
    event.node.res.statusCode = 400
    return { error: 'Promo code required' }
  }

  // 1) lookup promo
  const promo = await prisma.promoCode.findUnique({
    where: { code: code.trim()  },
  })
  if (!promo) {
    event.node.res.statusCode = 404
    return { error: 'Invalid promo code' }
  }

  // 2) business rules
  if (!promo.isActive) {
    event.node.res.statusCode = 409
    return { error: 'Promo code is inactive' }
  }
  if (promo.expiresAt < new Date()) {
    event.node.res.statusCode = 409
    return { error: 'Promo code expired' }
  }
  if (promo.usageLimit !== null && promo.usageLimit !== undefined) {
    const usageCount = promo.usageCount ?? 0
    if (usageCount >= promo.usageLimit) {
      event.node.res.statusCode = 409
      return { error: 'Usage limit reached' }
    }
  }
  

  // 3) atomically increment usageCount
  const updated = await prisma.promoCode.update({
    where: { id: promo.id },
    data: { usageCount: { increment: 1 } },
  })

  // 4) return discount info
  return {
    discountPercent: updated.discountPercent,
    promoId: updated.id,
  }
})
