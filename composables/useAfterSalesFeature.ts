import { computed, ref, toValue, watch, onServerPrefetch, onScopeDispose, type MaybeRefOrGetter } from 'vue';
import { normalizeSalesWorkflow } from '~/utils/sales-workflow';

/** Resolve the owning companies, including mixed-company tables, without changing the session. */
export function useAfterSalesFeature(companyIds: MaybeRefOrGetter<string | string[]>, fetcher: any = useRequestFetch()) {
    const saved = useState<Record<string, ReturnType<typeof normalizeSalesWorkflow>>>('sales-workflow-settings', () => ({}));
    const revisions = useState<Record<string, number>>('sales-workflow-revisions', () => ({}));
    const ids = computed(() => [...new Set([toValue(companyIds)].flat().filter(Boolean))]);
    const failed = ref<string[]>([]);
    let version = 0;
    async function load() {
        const current = ++version;
        failed.value = [];
        await Promise.all(ids.value.map(async id => {
            const revision = revisions.value[id] || 0;
            try {
                const result = await fetcher('/api/settings/sales-workflow', { headers: { 'x-company-id': id, 'x-company-filter': id } });
                if (current === version && (revisions.value[id] || 0) === revision) saved.value[id] = normalizeSalesWorkflow(result.preferences);
            } catch {
                if (current === version) failed.value.push(id);
            }
        }));
    }
    const isEnabled = (id: string) => ids.value.includes(id) && !failed.value.includes(id) && saved.value[id]?.includeAfterSales === true;
    const enabled = computed(() => ids.value.length === 1 && isEnabled(ids.value[0]));
    const ready = load();
    watch(() => ids.value.join(','), load);
    onServerPrefetch(() => ready);
    onScopeDispose(() => { version++; });
    return { enabled, isEnabled, ready, load };
}
