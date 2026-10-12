/** Account defaults live in the existing auth session, like companyPhone. */
export function useSelectedAccounts() {
  const auth = useNuxtApp().$auth;
  async function refresh(companyId = auth.session.value?.companyId) {
    const selected = await $fetch<any>('/api/auth/selected-accounts', { method: 'POST', body: { companyId } });
    if (companyId === auth.session.value?.companyId) await auth.updateSession();
    return { defaults: selected.defaults };
  }
  async function get(companyId = auth.session.value?.companyId) {
    const selected = auth.session.value?.selectedAccounts;
    if (selected?.companyId === companyId) return { defaults: JSON.parse(JSON.stringify(selected.defaults)) };
    return refresh(companyId);
  }
  return { get, refresh };
}
