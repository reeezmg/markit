import { prisma } from '~/server/prisma';

export default eventHandler(async (event) => {
    const body = await readBody(event);
    const session = await useAuthSession(event);

    const { variants } = body; // Now expecting variants array directly in the body
    
    if (!variants || !Array.isArray(variants)) {
        throw createError({ statusCode: 400, message: "Variants array is required" });
    }

 

    try {
       let newItems = [];
        const variantIds = [];

        for (const variant of variants) {
            if (!variant.qty || variant.qty <= 0) continue;

            if (variant.id) {
                variantIds.push(variant.id);
            }

            if (variant.sizes && variant.sizes.length > 0) {
                for (const size of variant.sizes) {
                    newItems.push({
                        variantId: variant.id,
                        size: size.size,
                        qty: size.qty || 0,
                    });
                }
            } else {
                newItems.push({
                    variantId: variant.id,
                    size: null,
                    qty: variant.qty || 0,
                });
            }
        }

       

        // Add companyId to each item
        const companyId = session.data.companyId;
        newItems = newItems.map(item => ({
            ...item,
            companyId,
        }));

        // First delete all existing items for these variants
        if (variantIds.length > 0) {
            await prisma.item.deleteMany({
                where: {
                    variantId: { in: variantIds },
                    companyId: companyId // Optional: ensure we only delete our company's items
                }
            });
        }

        // Then insert new items (barcode auto-generated by DB)
        const res = await prisma.item.createMany({ 
            data: newItems 
        });

   
        console.log(res)
        // Fetch created items with their related variant and product data
        const createdItems = await prisma.item.findMany({
            where: {
                variantId: { in: variantIds },
                companyId: companyId
            },
            orderBy: { createdAt: 'desc' },
            include: {
                variant: {
                    include: {
                        product: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            }
        });

        return { items: createdItems };
    } catch (error) {
        console.error("Error generating items:", error);
        throw createError({ statusCode: 500, message: "Failed to generate items" });
    }
});