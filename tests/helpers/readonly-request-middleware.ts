import { createError, defineEventHandler, getRequestURL, setResponseHeader, readBody } from 'h3';
import { prisma } from '../../server/prisma';

// Registered only in the isolated audit server, before business API handlers.
export default defineEventHandler(async event => {
  const path = getRequestURL(event).pathname;
  const externalWorkflow = ['storefront-source', 'storefront-agent', 'storefront-design']
    .some(resource => path === `/api/ecommerce-cms/${resource}` || path.startsWith(`/api/ecommerce-cms/${resource}/`));
  const switching = event.method === 'POST' && path === '/api/auth/switch-company';
  // Verified readers: POST bodies carry filters; handlers perform SELECTs only.
  const readPost = process.env.BRANCH_E2E_FORM_TESTS !== '1' && event.method === 'POST' &&
    ['/api/billSale/findManyBills', '/api/stock-aggregate'].includes(path);
  const prefix = process.env.BRANCH_E2E_RECORD_PREFIX || '';
  const fixtureRoute = path.match(/^\/api\/model\/(coupon|brand|collection|category)\/(create|update|delete)$/);
  if (process.env.BRANCH_E2E_FORM_TESTS === '1' && /^BRANCH_E2E_[A-Z0-9_]+$/.test(prefix) &&
      fixtureRoute && (fixtureRoute[1] === 'coupon' || process.env.BRANCH_E2E_CATALOG_FORMS === '1') &&
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(event.method)) {
    const model = fixtureRoute[1] as 'coupon' | 'brand' | 'collection' | 'category';
    const operation = fixtureRoute[2];
    const identity = model === 'coupon' ? 'code' : 'name';
    const body = event.method === 'DELETE' ? JSON.parse(getRequestURL(event).searchParams.get('q') || '{}') : await readBody(event);
    const delegate = prisma[model] as any;
    const code = operation === 'create' ? body?.data?.[identity]
      : (typeof body?.where?.id === 'string' ? (await delegate.findUnique({ where: { id: body.where.id }, select: { [identity]: true } }))?.[identity] : null);
    const allowedFields = model === 'coupon'
      ? ['code', 'type', 'discountValue', 'giftBarcode', 'maxDiscountAmount', 'minOrderValue', 'minBillAmount',
        'audienceType', 'targetType', 'startDate', 'endDate', 'usageLimit', 'perClientLimit', 'isActive', 'isBillCombine', 'company']
      : model === 'category'
        ? ['name', 'description', 'status', 'image', 'banner', 'targetAudience', 'company', 'hsn', 'shortCut',
          'taxType', 'fixedTax', 'thresholdAmount', 'taxBelowThreshold', 'taxAboveThreshold', 'margin', 'subcategories']
        : ['name', 'description', 'status', 'image', 'banner', 'targetAudience', 'company'];
    const scalarData = Object.entries(body?.data || {}).every(([key, value]) => allowedFields.includes(key) &&
      (key === 'company' ? operation === 'create' && Object.keys(value as object).length === 1 &&
        typeof (value as any)?.connect?.id === 'string' && Object.keys((value as any).connect).length === 1
        : key === 'subcategories' ? model === 'category' && operation === 'create' &&
          Object.keys(value as object).length === 1 && Array.isArray((value as any)?.create) && (value as any).create.length === 0
        : value === null || typeof value !== 'object'));
    if (typeof code === 'string' && code.startsWith(prefix) && scalarData &&
        (body?.data?.[identity] === undefined || typeof body.data[identity] === 'string' && body.data[identity].startsWith(prefix)) &&
        (operation === 'create' || Object.keys(body.where).length === 1)) return;
  }
  if (externalWorkflow || (!['GET', 'HEAD', 'OPTIONS'].includes(event.method) && !switching && !readPost)) {
    setResponseHeader(event, 'x-branch-audit-blocked', externalWorkflow ? 'external-workflow' : 'mutation');
    throw createError({ statusCode: 409, statusMessage: 'This action is blocked by the read-only page audit' });
  }
});
