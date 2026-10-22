type PageQueryClient = {
  getQueryCache(): { getAll(): Array<{ isActive(): boolean; state: { fetchStatus: string; status: string } }> };
};

// Vue production builds do not expose app._instance. The root vnode still owns
// the mounted component in both production and development.
export function vuePageMounted(container?: { _vnode?: { component?: { isMounted?: boolean } } }) {
  return container?._vnode?.component?.isMounted === true;
}

export function requestBelongsToDocument(loader: string | undefined, current: string) {
  return !loader || !current || loader === current;
}

export function hasCompanyRestriction(value: any, companyId: string, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  const owner = value.companyId;
  if (owner === companyId || owner?.equals === companyId || (Array.isArray(owner?.in) && owner.in.length === 1 && owner.in[0] === companyId)) return true;
  return Object.values(value).some(child => hasCompanyRestriction(child, companyId, seen));
}

// Also serialized into Chrome: keep the body self-contained.
export function activePageQueryState(client?: Pick<PageQueryClient, 'getQueryCache'>) {
  const queries = client?.getQueryCache().getAll().filter(query => query.isActive()) || [];
  return {
    loadingQueries: queries.filter(query => query.state.status === 'pending' || query.state.fetchStatus === 'fetching').length,
    failedQueries: queries.filter(query => query.state.status === 'error').length,
  };
}

export function nuxtPageDataState(nuxt?: {
  payload?: { _errors?: Record<string, unknown> };
  _asyncData?: Record<string, { status?: string | { value?: string } }>;
}) {
  return {
    loadingAsyncData: Object.values(nuxt?._asyncData || {}).filter(entry => {
      const status = entry.status;
      return (typeof status === 'object' && status !== null ? status.value : status) === 'pending';
    }).length,
    failedAsyncData: Object.values(nuxt?.payload?._errors || {}).filter(Boolean).length,
  };
}
