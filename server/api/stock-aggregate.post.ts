import { z } from 'zod'
import { prisma } from '~/server/prisma';
import { getReadCompanyIds } from '~/server/utils/organizationReadScope';

const bodySchema = z.object({
  companyId: z.string(),
  filters: z.object({
    category: z.string().nullable(),
    brand: z.string().nullable(),
    rating: z.string().nullable(),
    distributor: z.string().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable()
  }),
  groupBy: z.enum(['product', 'date', 'category', 'brand', 'rating', 'distributor'])
})

export default defineEventHandler(async (event) => {
  const { filters, groupBy } = bodySchema.parse(await readBody(event))
  const companyIds = await getReadCompanyIds(event)

  const where = {
    companyId: { in: companyIds },
    status: true,
    product: {
      status: true,
      ...(filters.category && { categoryId: filters.category }),
      ...(filters.brand && { brandId: filters.brand }),
      ...(filters.rating && { rating: parseFloat(filters.rating) }),
      ...((filters.distributor || filters.startDate || filters.endDate) && {
        purchaseorder: {
          ...(filters.distributor && { distributorId: filters.distributor }),
          ...((filters.startDate || filters.endDate) && { createdAt: {
            ...(filters.startDate && { gte: new Date(filters.startDate) }),
            ...(filters.endDate && { lte: new Date(filters.endDate) })
          } })
        }
      })
    }
  };

  const variants = await prisma.variant.findMany({
    where,
    include: {
      items: true,
      product: {
        include: {
          category: true,
          brand: true,
          subcategory: true,
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
  });

  const grouped: Record<string, { stock: number; purchaseStock: number; qty: number }> = Object.create(null);

  for (const variant of variants) {
    const product = variant.product;

    const key = (() => {
      switch (groupBy) {
        case 'category': return product.category?.name?.toLowerCase() || 'uncategorized';
        case 'brand': return product.brand?.name?.toLowerCase() || 'unbranded';
        case 'rating': return product.rating?.toString() || 'unrated';
        case 'date': return product.purchaseorder?.createdAt?.toISOString().split('T')[0] || 'unknown date';
        case 'distributor': return product.purchaseorder?.distributorCompany?.distributor?.name?.toLowerCase() || 'unknown distributor';
        default: return product.name?.toLowerCase() || 'unnamed product';
      }
    })();

    const itemQty = variant.items?.reduce((sum, item) => sum + (item.qty ?? 0), 0) ?? 0;
    const stockValue = itemQty * (variant.sprice ?? 0);
    const purchaseStockValue = itemQty * (variant.pprice ?? 0);

    if (!grouped[key]) {
      grouped[key] = { stock: 0, purchaseStock: 0, qty: 0 };
    }

    grouped[key].stock += stockValue;
    grouped[key].purchaseStock += purchaseStockValue;
    grouped[key].qty += itemQty;

  }

  return Object.entries(grouped).map(([key, { stock, purchaseStock, qty }]) => ({
    [groupBy]: key,
    stock: Number(stock.toFixed(2)),
    purchaseStock: Number(purchaseStock.toFixed(2)),
    qty
  }));
});
