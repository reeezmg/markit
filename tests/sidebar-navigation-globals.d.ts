import type { Ref } from 'vue';
declare global {
  const useState: <T>(key: string, initial: () => T) => Ref<T>;
  const useRequestFetch: () => any;
  const useSettingsCompany: () => Promise<{scope:{companyId:Ref<string>;busy:Ref<boolean>};auth:{session:Ref<Record<string,any>>};fetch:any}>;
  const useSidebarPreferences: typeof import('../composables/useSidebarPreferences')['useSidebarPreferences'];
  const useSalesWorkflow: typeof import('../composables/useSalesWorkflow')['useSalesWorkflow'];
  const ref: typeof import('vue')['ref'];
}
export {};
