import { appendCompanyWhere } from '~/utils/companyWhere';
import { computed, getCurrentInstance, inject, provide, ref, shallowRef, unref, toValue, type InjectionKey } from 'vue';

type Store = { id: string; name: string; parentCompanyId: string | null; isHeadOffice: boolean };
type ScopeMode = 'table' | 'form';
type ScopeFetch = {
  <T = any>(url: any, options?: any): Promise<T>;
  raw<T = any>(url: any, options?: any): Promise<any>;
};
const scopeKey: InjectionKey<CompanyScope> = Symbol('company-scope');
const instances = new WeakMap<object, CompanyScope>();
export type CompanyScope = ReturnType<typeof createCompanyScope>;

function createCompanyScope(mode: ScopeMode, pageForm = false) {
  const route = useRoute();
  const actualAuth = useNuxtApp().$auth;
  const requestFetch = useRequestFetch();
  const selected = ref(pageForm && typeof route.query.entryCompany === 'string' ? route.query.entryCompany : '');
  const owner = ref('');
  const settings = shallowRef<Record<string, any>>({});
  const busy = ref(false);
  const record = shallowRef<{ model: string; id: string; companyId: string } | null>(null);
  const { data: accessible } = useFetch<Store[]>('/api/auth/accessible-companies', { credentials: 'include' });
  const activeId = computed(() => actualAuth.session.value?.companyId || '');
  const enabled = computed(() => actualAuth.session.value?.role === 'admin' &&
    Boolean(accessible.value?.some(c => c.id === activeId.value && c.isHeadOffice && !c.parentCompanyId)));
  const companies = computed(() => (accessible.value ?? []).filter(c =>
    c.id === activeId.value || (enabled.value && c.parentCompanyId === activeId.value)));
  const companyId = computed(() => owner.value || (mode === 'form' ? selected.value : '') || activeId.value);
  const readIds = computed(() => mode === 'form' ? [companyId.value]
    : selected.value ? [selected.value] : enabled.value ? companies.value.map(c => c.id) : [activeId.value]);
  const session = computed(() => ({ ...actualAuth.session.value,
    ...(settings.value.companyId === companyId.value ? settings.value : {}), companyId: companyId.value }));
  const auth = { ...actualAuth, session } as typeof actualAuth;
  const recordId = pageForm ? String(route.params.id || route.params.salesId || route.query.poId || '') : '';
  const recordModel = route.path.startsWith('/users/salary/cycle/') ? 'PayrollCycle' : route.path.startsWith('/erp/') ? 'Bill'
    : route.path.includes('edit-purchase-return') ? 'PurchaseReturn'
    : route.path.includes('/brands/') ? 'Brand' : route.path.includes('/categories/') ? 'Category'
    : route.path.includes('/collections/') ? 'Collection' : route.query.poId ? 'PurchaseOrder' : 'Product';
  const ready = recordId || (selected.value && selected.value !== activeId.value)
    ? requestFetch<Record<string, any>>('/api/organization/context', { query: recordId
        ? { model: recordModel, id: recordId } : { companyId: selected.value } }).then(data => {
          settings.value = data;
          if (data.record) { record.value = data.record; owner.value = data.companyId; selected.value = data.companyId; }
        })
    : Promise.resolve();

  async function selectCompany(id: string) {
    if (!companies.value.some(c => c.id === id)) throw new Error('Company access denied');
    busy.value = true;
    try {
      const data = await requestFetch<Record<string, any>>('/api/organization/context', { query: { companyId: id } });
      settings.value = data;
      selected.value = id;
      owner.value = id;
    } finally { busy.value = false; }
  }
  async function selectOwner(id?: string | null) {
    if (!id || id === companyId.value) return;
    busy.value = true;
    try {
      const data = await requestFetch<Record<string, any>>('/api/organization/context', { query: { companyId: id } });
      settings.value = data;
      owner.value = id;
      if (mode === 'form') selected.value = id;
    } finally { busy.value = false; }
  }
  async function beginForm(existing?: { model: string; id: string; companyId: string } | null) {
    record.value = existing ?? null;
    await selectOwner(existing?.companyId || activeId.value);
  }
  function filter(id: string) { selected.value = id; }
  function companyName(id?: string) { return companies.value.find(c => c.id === id)?.name || id || ''; }
  function columns(value: any[]) { return enabled.value ? [{ key: 'companyId', label: 'Company / branch' }, ...value] : value; }
  function headers() {
    return { 'x-company-id': companyId.value,
      'x-company-filter': mode === 'table' ? selected.value || (enabled.value ? '*' : activeId.value) : companyId.value };
  }
  const scopedFetch = ((url: any, options: any = {}) => (requestFetch as any)(url, {
    ...options, headers: { ...headers(), ...options.headers },
  })) as ScopeFetch;
  scopedFetch.raw = (url: any, options: any = {}) => (requestFetch as any).raw(url, {
    ...options, headers: { ...headers(), ...options.headers },
  });
  function readArgs(value: any, ids = readIds.value): any {
    value = unref(value);
    if (Array.isArray(value)) return value.map(item => readArgs(item, ids));
    if (!value || typeof value !== 'object' || value instanceof Date) return value;
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key,
      key === 'companyId' && ([activeId.value, companyId.value].includes(val as string)
        || (Array.isArray((val as any)?.in) && (val as any).in.length === 1 && [activeId.value, companyId.value].includes((val as any).in[0]))
        || [activeId.value, companyId.value].includes((val as any)?.equals))
        ? (ids.length === 1 ? ids[0] : { in: ids })
        : readArgs(val, ids)]));
  }
  function downloadUrl(url: string) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}companyFilter=${encodeURIComponent(mode === 'table' ? selected.value || '*' : companyId.value)}&companyId=${encodeURIComponent(companyId.value)}`;
  }
  return { mode, pageForm, ready, enabled, companies, selected, companyId, readIds, auth, busy, record,
    selectCompany, selectOwner, beginForm, filter, companyName, columns, fetch: scopedFetch, readArgs, headers, downloadUrl };
}

/** One scope per table/form instance; never writes the logged-in session. */
export function useCompanyScope(mode?: ScopeMode, pageForm = false): CompanyScope {
  const instance = getCurrentInstance();
  const own = instance && instances.get(instance);
  if (own) return own;
  const inherited = inject(scopeKey, null);
  if (!mode && inherited) return inherited;
  const scope = createCompanyScope(mode ?? 'form', pageForm);
  if (instance) { instances.set(instance, scope); provide(scopeKey, scope); }
  return scope;
}

/** Preserve generated hook APIs while making their query keys include the company filter. */
export function withCompanyRead<T extends (...args: any[]) => any>(hook: T, model?: string): T {
  return ((args: any, options: any) => {
    const scope = useCompanyScope();
    const exact = options?.companyScope === 'form' || model === 'BankAccount';
    const hookOptions = options?.companyScope ? Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'companyScope')) : options;
    return hook(computed(() => {
      const ids = exact ? [scope.companyId.value] : scope.readIds.value;
      const value = scope.readArgs(toValue(args), ids) ?? {};
      if (!model || model === 'Client') return value;
      const cap = model === 'Distributor'
        ? { companies: { some: { companyId: { in: ids } } } }
        : { companyId: { in: ids } };
      return { ...value, where: appendCompanyWhere(value.where, cap) };
    }), hookOptions);
  }) as T;
}
