import { createError } from 'h3';
import type { PrismaClient } from '@prisma/client';
import { labelVariables } from '~/utils/label-variables';

// Selection comes exclusively from the label catalogue, never a client-supplied path.
function selectFields(prefix: string): Record<string, any> {
  const selection: Record<string, any> = {};
  for (const field of labelVariables.filter(v => v.key.startsWith(`${prefix}.`))) {
    const parts = field.key.slice(prefix.length + 1).split('.');
    let node = selection;
    for (const part of parts.slice(0, -1)) node = (node[part] ||= { select: {} }).select;
    node[parts.at(-1)!] = true;
  }
  return selection;
}
export async function readLabelVariables(db: PrismaClient, companyId: string, itemIds: string[], barcodes: string[]) {
  const company = await db.company.findUnique({ where: { id: companyId }, select: selectFields('company') });
  if (!company) throw createError({ statusCode: 404, statusMessage: 'Company not found' });
  const productSelect = selectFields('product');
  for (const key of ['category', 'subcategory', 'brand', 'collection']) productSelect[key].select.companyId = true;
  const variantSelect = selectFields('variant');
  variantSelect.brand.select.companyId = true;
  const rows: any[] = await db.item.findMany({
    where: { companyId, variant: { companyId, product: { companyId } }, OR: [{ id: { in: itemIds } }, { barcode: { in: barcodes } }] },
    select: { ...selectFields('item'), id: true, variant: { select: {
      ...variantSelect, customFields: true,
      product: { select: { ...productSelect, customFields: true,
        purchaseorder: { select: { ...selectFields('purchaseorder'), companyId: true,
          distributorCompany: { select: { companyId: true, ...selectFields('distributorCompany'), distributor: { select: selectFields('distributor') } } },
        } },
      } },
    } } },
  });
  return rows.map(row => {
    const { variant, ...item } = row;
    const { product, ...variantData } = variant;
    const { purchaseorder: purchase, ...productData } = product;
    for (const key of ['category', 'subcategory', 'brand', 'collection']) {
      if (productData[key]?.companyId !== companyId) productData[key] = null;
    }
    if (variantData.brand?.companyId !== companyId) variantData.brand = null;
    const purchaseorder = purchase?.companyId === companyId ? purchase : null;
    const distributorCompany = purchaseorder?.distributorCompany?.companyId === companyId ? purchaseorder.distributorCompany : null;
    return { itemId: row.id, barcode: row.barcode, variables: {
      company, item, variant: variantData, product: productData,
      purchaseorder, distributorCompany, distributor: distributorCompany?.distributor || null,
    } };
  });
}
