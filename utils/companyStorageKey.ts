/** Adopt legacy drafts once, then keep every company's drafts separate. */
export function companyStorageKey(base: string, companyId: string, activeCompanyId: string) {
  const key = `${base}:${companyId}`;
  if (typeof localStorage !== 'undefined' && companyId === activeCompanyId && !localStorage.getItem(key)) {
    const legacy = localStorage.getItem(base);
    const ownerKey = `${base}:legacy-owner`;
    const owner = localStorage.getItem(ownerKey);
    if (legacy && (!owner || owner === companyId)) {
      localStorage.setItem(key, legacy);
      localStorage.setItem(ownerKey, companyId);
    }
  }
  return key;
}
