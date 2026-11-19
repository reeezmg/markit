import { computed, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { normalizeSalesWorkflow } from '~/utils/sales-workflow';

/** Shared by the active-company sidebar and Company & Branches workflow settings. */
export function useSalesWorkflow(companyId: MaybeRefOrGetter<string>, fetcher: any = $fetch) {
    const saved = useState<Record<string, ReturnType<typeof normalizeSalesWorkflow>>>('sales-workflow-settings', () => ({}));
    const revisions = useState<Record<string, number>>('sales-workflow-revisions', () => ({}));
    const loading = ref(false), error = ref(''), canManage = ref(false);
    let version = 0;
    const preferences = computed(() => saved.value[toValue(companyId)] || normalizeSalesWorkflow(null));
    const options = (id: string) => ({ headers: { 'x-company-id': id, 'x-company-filter': id } });
    async function load() {
        const id = toValue(companyId), current = ++version, revision = revisions.value[id] || 0;
        if (!id) { loading.value = false; return; }
        loading.value = true; error.value = ''; canManage.value = false;
        try {
            const result = await fetcher('/api/settings/sales-workflow', options(id));
            if (current === version) {
                if ((revisions.value[id] || 0) === revision) saved.value[id] = normalizeSalesWorkflow(result.preferences);
                canManage.value = result.canManage;
            }
        } catch (e: any) { if (current === version) error.value = e.data?.statusMessage || e.message; }
        finally { if (current === version) loading.value = false; }
    }
    async function save(value: boolean | { includeInvoicing?: boolean; includeAfterSales?: boolean }) {
        const id = toValue(companyId);
        const body = typeof value === 'boolean' ? { includeInvoicing: value } : value;
        const result = await fetcher('/api/settings/sales-workflow', { ...options(id), method: 'PUT', body });
        revisions.value[id] = (revisions.value[id] || 0) + 1;
        saved.value[id] = normalizeSalesWorkflow(result.preferences);
    }
    const ready = load();
    watch(() => toValue(companyId), load);
    return { preferences, loading, error, canManage, ready, load, save };
}
