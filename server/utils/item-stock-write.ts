import { createError } from 'h3';

/** Seed the purchase baseline on creates; existing counters belong to source APIs. */
export function prepareItemStockWrite(data: any, creating: boolean) {
  if (!creating) {
    if (['qty', 'initialQty', 'soldQty'].some(field => data[field] !== undefined)) {
      throw createError({ statusCode: 409, statusMessage: 'Change initial quantity through the product edit API. Available and sold quantities are maintained by sales and returns.' });
    }
    return;
  }
  const initial = data.initialQty ?? data.qty ?? 0;
  if (!Number.isSafeInteger(initial) || initial < 0 || (data.soldQty != null && data.soldQty !== 0)) {
    throw createError({ statusCode: 400, statusMessage: 'New stock requires a non-negative whole initial quantity and zero sold quantity' });
  }
  data.initialQty = initial;
  data.qty = initial;
  data.soldQty = 0;
}
