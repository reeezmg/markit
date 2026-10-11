import { prisma } from '~/server/prisma';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { prepareItemStockWrite } from '~/server/utils/item-stock-write';

export default eventHandler(async (event) => {
  const { variants } = await readBody(event);
  const session = await useCompanyRequestSession(event);
  const companyId = session.data.companyId;
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  if (!Array.isArray(variants) || !variants.length || variants.some(v => typeof v.id !== 'string' || !v.id)) {
    throw createError({ statusCode: 400, statusMessage: 'Select variants to create items' });
  }
  const variantIds = [...new Set<string>(variants.map(v => v.id))].sort();
  if (variantIds.length !== variants.length) throw createError({ statusCode: 400, statusMessage: 'Duplicate variants' });
  const newItems = variants.flatMap(variant => {
    const sizes = variant.sizes?.length ? variant.sizes : [{ size: null, qty: variant.qty }];
    return sizes.map((size: any) => {
      const item = { variantId: variant.id, companyId, size: size.size || null, qty: size.qty ?? 0 };
      prepareItemStockWrite(item, true);
      return item;
    });
  });
  return prisma.$transaction(async db => {
    const owned: any[] = await db.$queryRawUnsafe(
      'SELECT id FROM variants WHERE id=ANY($1::text[]) AND company_id=$2 ORDER BY id FOR UPDATE', variantIds, companyId);
    if (owned.length !== variantIds.length) throw createError({ statusCode: 403, statusMessage: 'Variant belongs to another company or no longer exists' });
    if (await db.item.count({ where: { variantId: { in: variantIds } } })) {
      throw createError({ statusCode: 409, statusMessage: 'Items already exist. Edit initial quantities through the product form to preserve barcodes and sales history.' });
    }
    await db.item.createMany({ data: newItems });
    const items = await db.item.findMany({
      where: { variantId: { in: variantIds }, companyId }, orderBy: { createdAt: 'desc' },
      include: { variant: { include: { product: { select: { name: true } } } } },
    });
    return { items };
  }, { isolationLevel: 'Serializable' });
});
