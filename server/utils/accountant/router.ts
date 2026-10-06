import { createError } from 'h3';

export type AccountantRequest = {
  user: { companyId: string; userId: string; role: string };
  body: any;
  query: Record<string, any>;
  params: Record<string, string>;
};
export type AccountantResponse = { json: (data: any) => any; status: (code: number) => AccountantResponse };
type Handler = (req: AccountantRequest, res: AccountantResponse) => any;
export const badRequest = (message: string) => createError({ statusCode: 400, statusMessage: message });
export const notFound = (name: string) => createError({ statusCode: 404, statusMessage: `${name} not found` });
export const asyncHandler = (fn: Handler) => fn;
export const requireAuth: Handler = (req) => {
  if (!req.user.companyId || !req.user.userId) throw createError({ statusCode: 401 });
};
export const rbac = (_resource: string, _action: string): Handler => req => {
  if (!['admin', 'manager', 'accountant'].includes(req.user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Accountant access requires an admin, manager or accountant role' });
  }
};

/** Small route registry for the ported Accountant module; no Express server or cookies. */
export function Router() {
  const routes: { method: string; path: string; handlers: Handler[] }[] = [];
  const middleware: Handler[] = [];
  const router = {
    use: (...handlers: Handler[]) => { middleware.push(...handlers); },
    get: (path: string, ...handlers: Handler[]) => { routes.push({ method: 'GET', path, handlers }); },
    post: (path: string, ...handlers: Handler[]) => { routes.push({ method: 'POST', path, handlers }); },
    put: (path: string, ...handlers: Handler[]) => { routes.push({ method: 'PUT', path, handlers }); },
    patch: (path: string, ...handlers: Handler[]) => { routes.push({ method: 'PATCH', path, handlers }); },
    delete: (path: string, ...handlers: Handler[]) => { routes.push({ method: 'DELETE', path, handlers }); },
    async dispatch(method: string, path: string, req: AccountantRequest, res: AccountantResponse) {
      const parts = path.split('/').filter(Boolean);
      for (const route of routes) {
        const expected = route.path.split('/').filter(Boolean);
        if (method !== route.method || parts.length !== expected.length ||
          expected.some((part, i) => !part.startsWith(':') && part !== parts[i])) continue;
        req.params = Object.fromEntries(expected.flatMap((part, i) => part.startsWith(':') ? [[part.slice(1), parts[i]]] : []));
        for (const handler of [...middleware, ...route.handlers]) await handler(req, res);
        return;
      }
      throw notFound('Accountant route');
    },
  };
  return router;
}
