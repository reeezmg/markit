import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { defaultSidebarPreferences, normalizeSidebarPreferences, type SidebarPreferences } from '../utils/sidebar-navigation';

/** Company settings shared by the layout and editor; branch edits never replace active-company values. */
export function useSidebarPreferences(companyId: MaybeRefOrGetter<string>, fetcher?: any) {
  const request = fetcher || useRequestFetch();
  const saved = useState<Record<string, SidebarPreferences>>('sidebar-navigation-preferences', () => ({}));
  const revisions = useState<Record<string, number>>('sidebar-navigation-revisions', () => ({}));
  const loading = ref(false), error = ref(''), canManage = ref(false);
  const preferences = computed(() => saved.value[toValue(companyId)] || defaultSidebarPreferences());
  let generation = 0;
  const options = (id: string) => ({ headers: { 'x-company-id': id } });
  async function load() {
    const id = toValue(companyId), token = ++generation, revision = revisions.value[id] || 0;
    loading.value = !!id; error.value = ''; canManage.value = false;
    if (!id) return;
    try {
      const result = await request('/api/settings/sidebar-navigation', options(id));
      if (token !== generation) return;
      if ((revisions.value[id] || 0) === revision) saved.value[id] = normalizeSidebarPreferences(result.preferences);
      canManage.value = result.canManage;
    } catch (e: any) { if (token === generation) error.value = e.data?.statusMessage || e.message || 'Could not load sidebar settings.'; }
    finally { if (token === generation) loading.value = false; }
  }
  async function save(value: SidebarPreferences) {
    const id = toValue(companyId);
    const result = await request('/api/settings/sidebar-navigation', { ...options(id), method: 'PUT', body: value, retry: 0 });
    revisions.value[id] = (revisions.value[id] || 0) + 1;
    saved.value[id] = normalizeSidebarPreferences(result.preferences);
    return saved.value[id];
  }
  const ready = load(); watch(() => toValue(companyId), load);
  return { preferences, ready, loading, error, canManage, load, save };
}
