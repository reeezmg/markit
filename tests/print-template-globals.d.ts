import type { $Fetch } from 'ofetch';
declare global {
  function useSettingsCompany(): Promise<{ fetch: $Fetch; auth: { session: { value: Record<string, any> | null } } }>;
  function useToast(): { add: (message: Record<string, any>) => void };
  const $fetch: $Fetch;
  function useNuxtApp(): { $auth: { session: { value: { role: string; companyId: string } | null } } };
  function useCompanyScope(mode?: string): { ready: Promise<unknown>; fetch: $Fetch; auth: { session: { value: { role: string; companyId: string } | null } } };
  function useState<T>(key: string, init: () => T): import('vue').Ref<T>;
  function navigateTo(to: string | { path: string; query?: Record<string, string> }): unknown;
  function useRuntimeConfig(): Record<string, unknown>;
  const ref: typeof import('vue')['ref'];
  const watch: typeof import('vue')['watch'];
  const computed: typeof import('vue')['computed'];
  const onBeforeUnmount: typeof import('vue')['onBeforeUnmount'];
  function definePageMeta(meta: Record<string, unknown>): void;
  function useHead(head: Record<string, unknown>): void;
  function useRoute(): { params: Record<string, any>; query: Record<string, any>; fullPath: string };
  const createError: typeof import('h3')['createError'];
  function useSizeLabel(): { labelFor: (item: any) => string };
  function requireAuthSession(event: import('h3').H3Event): Promise<{ data: { id: string; companyId: string; role: string; [key: string]: any } }>;
}
export {};
