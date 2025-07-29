import { prisma } from '~/server/utils/prisma'
import type { LikedProduct } from '~/types'

export default defineEventHandler(async (event) => {
  try {
    const { guestItems = [], companyId, clientId } = await readBody(event)
    
    // Validate required fields
    if (!companyId || !clientId) {
      throw createError({ statusCode: 400, message: 'Both companyId and clientId are required' })
    }

    // Type guard for LikedProduct
    const isValidLikeItem = (item: any): item is LikedProduct => {
      return item && typeof item.variantId === 'string'
    }

    // Filter and type the incoming items
    const validGuestItems: LikedProduct[] = guestItems.filter(isValidLikeItem)
    const guestVariantIds: string[] = validGuestItems.map((item: LikedProduct) => item.variantId)

    // Get or create like collection
    const likeRecord = await prisma.likeCompanyClient.upsert({
      where: { clientId_companyId: { clientId, companyId } },
      create: {
        client: { connect: { id: clientId } },
        company: { connect: { id: companyId } },
        like: { create: { variantIds: [] } } 
      },
      update: {},
      include: { like: true }
    })

    // Get current variantIds (with type assertion)
    const currentVariantIds: string[] = likeRecord.like?.variantIds || []

    // Merge and deduplicate
    const mergedVariantIds: string[] = [
      ...new Set([
        ...currentVariantIds,
        ...guestVariantIds
      ])
    ]

    // Update the record
    await prisma.like.update({
      where: { id: likeRecord.likeId },
      data: { variantIds: mergedVariantIds }
    })

    return { 
      success: true,
      count: mergedVariantIds.length,
      variantIds: mergedVariantIds
    }

  } catch (error: any) {
    console.error('Like merge failed:', error)
    
    if (error.code === 'P2002') {
      throw createError({ statusCode: 409, message: 'Like collection already exists' })
    }

    throw createError({
      statusCode: 500,
      message: 'Failed to merge likes',
      data: process.env.NODE_ENV === 'development' ? { error: error.message } : undefined
    })
  }
})