import type { Ref } from 'vue'
import type { H3Event } from 'h3'
declare global {
  const $fetch: typeof import('ofetch')['$fetch']
  const computed: typeof import('vue')['computed']
  function definePageMeta(meta: Record<string, unknown>): void
  const useRoute: typeof import('vue-router')['useRoute']
  function navigateTo(to: any, options?: { replace?: boolean }): Promise<any>
  function requireAuthSession(event: H3Event): Promise<{ data: { id: string; companyId: string; role: string; [key: string]: any } }>
  function useCompanyScope(mode?: 'form' | 'table'): { companyId: Ref<string>; busy: Ref<boolean>; auth: { session: Ref<Record<string, any> | null> }; selectOwner(id: string): Promise<void> }
  function useRuntimeConfig(): any
  const createError: typeof import('h3')['createError']
}
export {}
