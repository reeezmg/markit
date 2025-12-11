import { z } from 'zod'
import { prisma } from '~/server/prisma';

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
  groupBy: z.string()
})

export default defineEventHandler(async (event) => {
  const { companyId, filters, groupBy } = bodySchema.parse(await readBody(event))

  const where = {
    companyId,
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
  };

  const variants = await prisma.variant.findMany({
    where,
    include: {
      items: true,
      product: {
        include: {
          category: true,
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

  const grouped: Record<string, { stock: number; purchaseStock: number; qty: number }> = {};

  // ⭐ New nested structure for subcategory + variant breakdown
  const categoryBreakdown: Record<string, Record<string, Record<string, number>>> = {};

  for (const variant of variants) {
    const product = variant.product;

    const key = (() => {
      switch (groupBy) {
        case 'category': return product.category?.name?.toLowerCase() || 'uncategorized';
        case 'brand': return product.brand?.toLowerCase() || 'unbranded';
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

    // ⭐ Subcategory + variant breakdown (only when grouped by category)
    if (groupBy === "category") {
      const subKey = product.subcategory?.name?.toLowerCase() || "no-subcategory";
      const variantKey = variant.name.toLowerCase();

      if (!categoryBreakdown[key]) categoryBreakdown[key] = {};
      if (!categoryBreakdown[key][subKey]) categoryBreakdown[key][subKey] = {};
      if (!categoryBreakdown[key][subKey][variantKey]) categoryBreakdown[key][subKey][variantKey] = 0;

      categoryBreakdown[key][subKey][variantKey] += itemQty;
    }
  }

  // 🔥 Console Output
  if (groupBy === "category") {
    console.log("===== Category → Subcategory → Variant Breakdown =====");

    for (const categoryName in categoryBreakdown) {
      console.log(`Category: ${categoryName}`);

      for (const sub in categoryBreakdown[categoryName]) {
        const totalSubQty = Object.values(categoryBreakdown[categoryName][sub]).reduce((a, b) => a + b, 0);
        console.log(`  Subcategory: ${sub}  --> Total Qty: ${totalSubQty}`);

        for (const variantName in categoryBreakdown[categoryName][sub]) {
          console.log(
            `     Variant: ${variantName} --> Qty: ${categoryBreakdown[categoryName][sub][variantName]}`
          );
        }
      }
    }

    console.log("=====================================================");
  }

  return Object.entries(grouped).map(([key, { stock, purchaseStock, qty }]) => ({
    [groupBy]: key,
    stock: Number(stock.toFixed(2)),
    purchaseStock: Number(purchaseStock.toFixed(2)),
    qty
  }));
});
