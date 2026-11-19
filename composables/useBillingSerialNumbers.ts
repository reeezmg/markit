import { computed, ref, toValue, watch, onScopeDispose, type MaybeRefOrGetter, type Ref } from 'vue';

/** Serial numbers belong to draft rows; save uses the existing per-unit service payload. */
export function useBillingSerialNumbers(items: Ref<any[]>, clientId: Ref<string>, enabled: Ref<boolean>, companyId: MaybeRefOrGetter<string>, fetcher: any) {
    const links = ref<any[]>([]), owned = ref<any[]>([]), error = ref('');
    const returnedUnitIds = ref<string[]>([]);
    let version = 0;
    let ownerClient = '', pending: Promise<void>;
    const itemIds = computed(() => [...new Set(items.value.map(row => row.id).filter(Boolean))].sort().join(','));
    const returnItemIds = computed(() => [...new Set(items.value.filter(row => row.return).map(row => row.id).filter(Boolean))].sort().join(','));
    const isCovered = (row: any) => enabled.value && !row.return && links.value.some(link => link.item_id === row.id);
    const required = computed(() => items.value.some(isCovered));
    const units = (row: any) => Math.max(0, Math.min(10000, Math.trunc(Number(row.qty) || 0)));

    watch(() => items.value.map(row => [row.id, row.qty, row.return]), () => {
        const keys = new Set<string>();
        for (const row of items.value) {
            if (!row.id || row.return) continue;
            if (row.serviceSerialItemId && row.serviceSerialItemId !== row.id) {
                row.serviceSerialNumbers = [];
                row.serviceInstalledDates = [];
                row.serviceDeliveredDates = [];
                row.serviceLineKey = undefined;
            }
            row.serviceSerialItemId = row.id;
            if (!row.serviceLineKey || keys.has(row.serviceLineKey)) row.serviceLineKey = crypto.randomUUID();
            keys.add(row.serviceLineKey);
            if (Array.isArray(row.serviceSerialNumbers) && row.serviceSerialNumbers.length > units(row)) row.serviceSerialNumbers = row.serviceSerialNumbers.slice(0, units(row));
            for (const field of ['serviceInstalledDates', 'serviceDeliveredDates']) {
                if (Array.isArray(row[field]) && row[field].length > units(row)) row[field] = row[field].slice(0, units(row));
            }
        }
    }, { immediate: true, flush: 'sync' });

    function setSerial(row: any, unit: number, value: string) {
        if (!isCovered(row) || unit < 0 || unit >= units(row)) return;
        const serials = [...(row.serviceSerialNumbers || [])];
        serials[unit] = value;
        row.serviceSerialNumbers = serials;
    }
    function setDetails(row: any, details: { serialNumber: string; installedOn: string; deliveredOn: string }[]) {
        if (!isCovered(row)) return;
        const values = details.slice(0, units(row));
        row.serviceSerialNumbers = values.map(unit => unit.serialNumber);
        row.serviceInstalledDates = values.map(unit => unit.installedOn);
        row.serviceDeliveredDates = values.map(unit => unit.deliveredOn);
    }
    const serviceUnits = computed(() => items.value.filter(isCovered).flatMap(row =>
        Array.from({ length: units(row) }, (_, unit) => ({
            itemId: row.id, entryId: row.entryId, lineKey: row.serviceLineKey, unit,
            serialNumber: String(row.serviceSerialNumbers?.[unit] || '').trim(),
            installedOn: String(row.serviceInstalledDates?.[unit] || ''),
            deliveredOn: String(row.serviceDeliveredDates?.[unit] || ''),
        })).filter(detail => detail.serialNumber || detail.installedOn || detail.deliveredOn)));

    async function read() {
        const current = ++version, company = toValue(companyId);
        const selectionOwner = `${company}:${clientId.value}`;
        if (ownerClient !== selectionOwner || !enabled.value) returnedUnitIds.value = [];
        ownerClient = selectionOwner;
        links.value = []; owned.value = []; error.value = '';
        if (!enabled.value || !company || !itemIds.value) return;
        const headers = { 'x-company-id': company, 'x-company-filter': company };
        try {
            const [coverage, products] = await Promise.all([
                fetcher('/api/after-sales/sale-context', { headers, query: { itemIds: itemIds.value } }),
                clientId.value && returnItemIds.value
                    ? fetcher('/api/after-sales/products', { headers, query: { clientId: clientId.value } })
                    : Promise.resolve([]),
            ]);
            if (current !== version) return;
            links.value = coverage;
            owned.value = products.filter((product: any) => product.status === 'ACTIVE' && items.value.some(row => row.return && row.id === product.item_id));
            returnedUnitIds.value = returnedUnitIds.value.filter(id => owned.value.some(product => product.id === id));
        } catch (e: any) {
            if (current === version && e?.statusCode !== 503 && e?.status !== 503) error.value = 'Could not load serial-number options. Please retry before saving covered items.';
        }
    }
    function load() { pending = read(); return pending; }
    async function waitUntilReady() {
        let current;
        do { current = pending; await current; } while (current !== pending);
        if (error.value) throw new Error(error.value);
    }
    const ready = load();
    watch(() => [itemIds.value, returnItemIds.value, clientId.value, toValue(companyId), enabled.value], load, { flush: 'sync' });
    onScopeDispose(() => { version++; });
    return { isCovered, required, units, setSerial, setDetails, serviceUnits, owned, returnedUnitIds, error, ready, load, waitUntilReady };
}
