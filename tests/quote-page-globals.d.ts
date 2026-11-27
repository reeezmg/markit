import type { Ref } from 'vue'
import type { $Fetch } from 'ofetch'
declare global {
  const $fetch: $Fetch
  const ref: typeof import('vue')['ref']
  const computed: typeof import('vue')['computed']
  const watch: typeof import('vue')['watch']
  const onMounted: typeof import('vue')['onMounted']
  const onBeforeUnmount: typeof import('vue')['onBeforeUnmount']
  function definePageMeta(meta: Record<string, unknown>): void
  function useHead(head: Record<string, unknown> | (() => Record<string, unknown>)): void
  const useRoute: typeof import('vue-router')['useRoute']
  function navigateTo(to: any, options?: { replace?: boolean; redirectCode?: number }): Promise<any>
  function useToast(): { add(message: Record<string, any>): void }
  function useState<T>(key: string, init: () => T): Ref<T>
  function useNuxtApp(): { $auth: { session: Ref<Record<string, any> | null> } }
  function useCompanyScope(mode?: 'form' | 'table', pageForm?: boolean): {
    ready: Promise<void>; companyId: Ref<string>; readIds: Ref<string[]>; enabled: Ref<boolean>; auth: { session: Ref<Record<string, any> | null> }
    fetch<T = any>(url: string, options?: any): Promise<T>
    companyName(id?: string): string
  }
  function useAsyncData<T>(key: string, load: () => Promise<T>, options?: any): Promise<{
    data: Ref<T>; pending: Ref<boolean>; error: Ref<any>; refresh(): Promise<void>
  }>
}
export {}
