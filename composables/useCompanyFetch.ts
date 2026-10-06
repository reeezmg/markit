/** Reactive request headers participate in Nuxt's fetch key and watch sources. */
export function useCompanyFetch<T = unknown>(url: any, options: any = {}) {
  const scope = useCompanyScope();
  return useFetch<T>(url, {
    ...options,
    headers: computed(() => ({ ...scope.headers(), ...toValue(options.headers) })),
    key: computed(() => JSON.stringify(['company', toValue(url), scope.readIds.value, scope.companyId.value,
      toValue(options.key), toValue(options.query), toValue(options.body)])),
  });
}
