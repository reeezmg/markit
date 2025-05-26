import { prisma } from '~/server/utils/prisma'
import type { LikedProduct } from '~/types'

export default defineEventHandler(async (event) => {
  const { companyId, clientId, items } = await readBody(event)
  
  if (!companyId || !clientId || !Array.isArray(items)) {
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  }

  try {
    // Verify all variants exist
    const variantIds = items.map(item => item.variantId)
    const existingVariants = await prisma.variant.findMany({
      where: { id: { in: variantIds }, companyId }
    })

    if (existingVariants.length !== variantIds.length) {
      throw createError({ statusCode: 404, message: 'Some variants not found' })
    }

    // Update the like record with new variantIds array
    const updatedLike = await prisma.likeCompanyClient.upsert({
      where: {
        clientId_companyId: {
          clientId,
          companyId
        }
      },
      create: {
        client: { connect: { id: clientId } },
        company: { connect: { id: companyId } },
        like: {
          create: { variantIds }
        }
      },
      update: {
        like: {
          update: { variantIds }
        }
      },
      include: {
        like: true
      }
    })

    return { 
      success: true,
      variantIds: updatedLike.like?.variantIds || []
    }
    
  } catch (error) {
    console.error('Failed to update likes:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to update likes'
    })
  }
})