import type { H3Event } from 'h3'
declare global {
  const createError: typeof import('h3')['createError']
  // Nuxt injects this function at runtime. Keep the compile check isolated from
  // unrelated auto-imports while retaining the identity/tenant/role contract.
  function requireAuthSession(event: H3Event): Promise<{data:{id:string;companyId:string;role:string;[key:string]:any}}>
}
