/** Prefer the current page's company defaults over the login's cached snapshot. */
export function useSelectedAccounts() {
  const auth = useNuxtApp().$auth;
  const scope = useCompanyScope();
  async function refresh(companyId = scope.companyId.value) {
    const selected = await scope.fetch<any>('/api/auth/selected-accounts', { method: 'POST', body: { companyId } });
    if (companyId === auth.session.value?.companyId) await auth.updateSession();
    if (companyId === scope.companyId.value) await scope.refreshSettings();
    return { defaults: selected.defaults };
  }
  async function get(companyId = scope.companyId.value) {
    await scope.ready;
    const selected = scope.auth.session.value?.selectedAccounts;
    if (selected?.companyId === companyId) return { defaults: JSON.parse(JSON.stringify(selected.defaults)) };
    return refresh(companyId);
  }
  return { get, refresh };
}
