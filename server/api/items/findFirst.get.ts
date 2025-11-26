import { prisma } from '~/server/prisma' 
import { defineEventHandler, getQuery } from 'h3';

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const session = await useAuthSession(event);
  const companyId = session.data.companyId 

  console.log('Query:', query)
  
  try {
    const item = await prisma.item.findFirst({
      where: {
        companyId: companyId,
        variant: {
          sprice: Number(query.sPrice), 
          product: {
            category: {
              id: query.categoryId
            }
          }
        }
      },
      select: {
    id: true,
    size: true,
    qty: true,
    variant: {
      select: {
        id: true,
        sprice: true,
        name: true,
        tax: true,
        discount: true,
        product: {
          select: {
            name: true,
            categoryId: true,
            category: {
              select: {
                taxType: true,
                fixedTax: true,
                thresholdAmount: true,
                taxBelowThreshold: true,
                taxAboveThreshold: true
              }
            }
          }
        }
      }
    }
  }
    })
    
    return { data: item }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error'
    })
  }
})