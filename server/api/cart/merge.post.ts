

import { Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import type { CartItem } from '~/types'

export default defineEventHandler(async (event) => {
  try {
    // 1. Validate input
    const { guestItems = [], companyId, clientId = '1db12f74-8805-42be-95a6-26d807151000' } = await readBody(event)
    
    if (!companyId || !clientId) {
      throw createError({ statusCode: 400, message: 'Both companyId and clientId are required' })
    }

    if (!Array.isArray(guestItems)) {
      throw createError({ statusCode: 400, message: 'guestItems must be an array' })
    }

    // 2. Validate guest items
    const isValidCartItem = (item: any): item is CartItem => {
      return item && typeof item.variantId === 'string'
    }
    const validGuestItems = guestItems.filter(isValidCartItem)

    // 3. Get or create cart
    const cartRecord = await prisma.cartCompanyClient.upsert({
      where: { clientId_companyId: { clientId, companyId } },
      create: {
        client: { connect: { id: clientId } },
        company: { connect: { id: companyId } },
        cart: { create: { items: "[]" } } // Start with empty array
      },
      update: {},
      include: { cart: true }
    })

    // 4. Properly parse existing items (handle both string and array cases)
    const parseCartItems = (items: any): CartItem[] => {
      try {
        if (Array.isArray(items)) return items
        if (typeof items === 'string') return JSON.parse(items) || []
        return []
      } catch {
        return []
      }
    }

    const currentItems = parseCartItems(cartRecord.cart.items)
    const guestItemsParsed = parseCartItems(validGuestItems)

    // 5. Improved merge logic (preserves existing items, adds new ones)
    const mergedItems = [...currentItems]
    
    for (const guestItem of guestItemsParsed) {
      const existingIndex = mergedItems.findIndex(i => 
        i.variantId === guestItem.variantId && 
        (i.size === guestItem.size || (!i.size && !guestItem.size))
      )

      if (existingIndex >= 0) {
        // Option 1: Replace quantity (use latest)
        //mergedItems[existingIndex].qty = guestItem.qty || 1
        
        // Option 2: Or if you want to add quantities (comment above and uncomment below)
         mergedItems[existingIndex].qty += guestItem.qty || 1
      } else {
        mergedItems.push({
          variantId: guestItem.variantId,
          size: guestItem.size ?? null,
          qty: guestItem.qty || 1
        })
      }
    }

    // 6. Update cart
    await prisma.cart.update({
      where: { id: cartRecord.cartId },
      data: { items: mergedItems as unknown as Prisma.JsonArray}
    })

    return { 
      success: true,
      items: mergedItems,
      originalCount: currentItems.length,
      guestCount: guestItemsParsed.length,
      mergedCount: mergedItems.length
    }

  } catch (error: any) {
    console.error('Cart merge failed:', error)
    
    if (error.code === 'P2002') {
      throw createError({ statusCode: 409, message: 'Cart already exists for this user and company' })
    }

    throw createError({
      statusCode: 500,
      message: 'Failed to merge carts',
      data: process.env.NODE_ENV === 'development' ? { error: error.message } : undefined
    })
  }
})