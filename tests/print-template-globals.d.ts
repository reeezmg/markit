import type { $Fetch } from 'ofetch';
declare global {
  function useSettingsCompany(): Promise<{ fetch: $Fetch; auth: { session: { value: Record<string, any> | null } } }>;
  function useToast(): { add: (message: Record<string, any>) => void };
  const $fetch: $Fetch;
  function useNuxtApp(): { $auth: { session: { value: { role: string; companyId: string } | null } } };
  function useCompanyScope(): { fetch: $Fetch; auth: { session: { value: { role: string; companyId: string } | null } } };
  function useRuntimeConfig(): Record<string, unknown>;
  const ref: typeof import('vue')['ref'];
  const watch: typeof import('vue')['watch'];
  const computed: typeof import('vue')['computed'];
  function definePageMeta(meta: Record<string, unknown>): void;
  function useHead(head: Record<string, unknown>): void;
  function useRoute(): { params: Record<string, any>; query: Record<string, any> };
  const createError: typeof import('h3')['createError'];
  function useSizeLabel(): { labelFor: (item: any) => string };
  function requireAuthSession(event: import('h3').H3Event): Promise<{ data: { id: string; companyId: string; role: string; [key: string]: any } }>;
}
export {};
