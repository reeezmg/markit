declare global {
  const defineEventHandler: typeof import('h3')['defineEventHandler']
  const readBody: typeof import('h3')['readBody']
  const getHeader: typeof import('h3')['getHeader']
  const getQuery: typeof import('h3')['getQuery']
  const getRequestURL: typeof import('h3')['getRequestURL']
  function useAuthSession(event: import('h3').H3Event): Promise<{data:{id:string;companyId:string;role:string;[key:string]:any};update(value:any):Promise<any>}>
  function useState<T>(key: string, init: () => T): import('vue').Ref<T>
  function useRequestFetch(): typeof $fetch
  const useAfterSalesFeature: typeof import('../composables/useAfterSalesFeature').useAfterSalesFeature
  function useSettingsCompany(): Promise<{
    scope: { companyId: import('vue').Ref<string> }
    fetch<T = any>(url: string, options?: any): Promise<T>
  }>
  const toRaw: typeof import('vue')['toRaw']
  function navigateTo(to: any, options?: any): Promise<any>
}
export {}
