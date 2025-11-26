// ~/utils/routeHelper.ts for store
export const formatStoreRoute = (company: string | string[], path = '') => {
  const companySlug = Array.isArray(company) ? company[0] : company;
  return `/store/${companySlug.replace(/^\/|\/$/g, '')}/${path.replace(/^\//, '')}`;
};