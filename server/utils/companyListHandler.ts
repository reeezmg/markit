import { defineEventHandler, type H3Event } from 'h3';
import { getReadCompanyIds } from './organizationReadScope';
import { prisma } from '~/server/prisma';

/** Reuse each company's existing ledger calculations without merging staff identities. */
export function defineCompanyListHandler(handler: (event: H3Event) => Promise<any>) {
  return defineEventHandler(async event => {
    const ids = await getReadCompanyIds(event);
    const companies = await prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const results = await Promise.all(companies.map(async company => {
      const context = { ...event.context, requestCompanyId: company.id };
      const scopedEvent = new Proxy(event, { get(target, key) { return key === 'context' ? context : Reflect.get(target, key); } });
      const annotate = (value: any): any => {
        if (Array.isArray(value)) return value.map(annotate);
        if (!value || typeof value !== 'object' || value instanceof Date || (typeof value.toJSON === 'function')) return value;
        return { ...Object.fromEntries(Object.entries(value).map(([key, item]) => [key, annotate(item)])),
          companyId: company.id, companyName: company.name,
          ...(value.id || value.userId ? { scopeKey: `${company.id}:${value.id || value.userId}` } : {}) };
      };
      return annotate(await handler(scopedEvent));
    }));
    if (Array.isArray(results[0])) return results.flat();
    const combined: any = {};
    for (const result of results) for (const [key, value] of Object.entries(result ?? {})) {
      if (Array.isArray(value)) combined[key] = [...(combined[key] ?? []), ...value];
      else if (typeof value === 'number') combined[key] = (combined[key] ?? 0) + value;
      else if (!(key in combined)) combined[key] = value;
    }
    return combined;
  });
}
