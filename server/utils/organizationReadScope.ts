import { createError, getHeader, getQuery, type H3Event } from 'h3';
import { authorizedCompanyIds, assertCompanyAccess } from './companyRequestScope';

/** Explicit request scope for SQL lists. The authentication company never changes. */
export async function getReadCompanyIds(event: H3Event): Promise<string[]> {
  const session = await requireAuthSession(event);
  const ids = await getAuthorizedCompanyIds(event);
  const selected = getHeader(event, 'x-company-filter') ?? getQuery(event).companyFilter;
  if (selected !== undefined && typeof selected !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid company filter' });
  }
  if (selected === '*') return ids;
  const companyId = typeof selected === 'string' && selected
    ? selected : getHeader(event, 'x-company-id') || getQuery(event).companyId || session.data.companyId;
  if (typeof companyId !== 'string' || !companyId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid company' });
  }
  return [await assertCompanyAccess(event, companyId)];
}

export async function getAuthorizedCompanyIds(event: H3Event): Promise<string[]> {
  return authorizedCompanyIds(event);
}

/** Selects one authorized store for documents whose numbering and header belong to a store. */
export async function getReadCompanyId(event: H3Event, requestedId?: string): Promise<string> {
  const session = await requireAuthSession(event);
  const ids = await getAuthorizedCompanyIds(event);
  const queryId = getQuery(event).companyId;
  if (queryId !== undefined && (typeof queryId !== 'string' || !queryId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid company' });
  }
  const id = requestedId || getHeader(event, 'x-company-id') || queryId || session.data.companyId;
  if (!ids.includes(id)) {
    throw createError({ statusCode: 403, statusMessage: 'Store access denied' });
  }
  return id;
}
