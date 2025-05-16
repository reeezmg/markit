import { z } from 'zod'
import { prisma } from '~/server/prisma';

const bodySchema = z.object({
  filters: z.object({
    category: z.string().nullable(),
    brand: z.string().nullable(),
    rating: z.string().nullable(),
    distributor: z.string().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable()
  }),
  groupBy: z.string()
})

export default defineEventHandler(async (event) => {
  const { filters, groupBy } = bodySchema.parse(await readBody(event))

  const where: any = {
    status: true,
    product: {
      status: true,
      ...(filters.category && { categoryId: filters.category }),
      ...(filters.brand && { brand: filters.brand }),
      ...(filters.rating && { rating: parseFloat(filters.rating) }),
      ...(filters.distributor && {
        purchaseorder: {
          distributorId: filters.distributor
        }
      }),
      ...(filters.startDate || filters.endDate) && {
        purchaseorder: {
          createdAt: {
            ...(filters.startDate && { gte: new Date(filters.startDate) }),
            ...(filters.endDate && { lte: new Date(filters.endDate) })
          }
        }
      }
    }
  }

  const variants = await prisma.variant.findMany({
    where,
    include: {
      product: {
        include: {
          category: true,
          purchaseorder: {
            include: {
              distributorCompany: {
                include: {
                  distributor: true
                }
              }
            }
          }
        }
      }
    }
  })

  const grouped: Record<string, { stock: number; qty: number }> = {}

for (const variant of variants) {
  const key = (() => {
    const product = variant.product
    switch (groupBy) {
      case 'category': return product.category?.name?.toLowerCase() || 'uncategorized'
      case 'brand': return product.brand?.toLowerCase() || 'unbranded'
      case 'rating': return product.rating?.toString() || 'unrated'
      case 'date': return product.purchaseorder?.createdAt?.toISOString().split('T')[0] || 'unknown date'
      case 'distributor': return product.purchaseorder?.distributorCompany?.distributor?.name?.toLowerCase() || 'unknown distributor'
      default: return product.name?.toLowerCase() || 'unnamed product'
    }
  })()

  const stockValue = (variant.qty ?? 0) * (variant.sprice ?? 0)
  const quantity = variant.qty ?? 0

  if (!grouped[key]) {
    grouped[key] = { stock: 0, qty: 0 }
  }

  grouped[key].stock += stockValue
  grouped[key].qty += quantity
}

return Object.entries(grouped).map(([key, { stock, qty }]) => ({
  [groupBy]: key,
  stock: Number(stock.toFixed(2)),
  qty
}))
})
