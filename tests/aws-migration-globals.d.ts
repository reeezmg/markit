// Narrow server compilation avoids the unrelated full Nuxt project graph.
declare const defineEventHandler: typeof import('h3').defineEventHandler;
declare const createError: typeof import('h3').createError;
declare const getQuery: typeof import('h3').getQuery;
declare const readBody: typeof import('h3').readBody;
declare const getRouterParam: typeof import('h3').getRouterParam;
declare function useRuntimeConfig(event?: import('h3').H3Event): Record<string, any>;
declare function requireAuthSession(event: import('h3').H3Event): Promise<{ data: { companyId: string; userId: string; id: string } }>;
