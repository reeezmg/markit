export type ProductCustomFieldScope = 'PRODUCT' | 'VARIANT'
export type ProductCustomFieldType = 'TEXT' | 'SELECT'

export interface ProductCustomFieldDef {
  id: string
  scope: ProductCustomFieldScope
  key: string
  label: string
  type: ProductCustomFieldType
  options: string[]
  required: boolean
  active: boolean
  sortOrder: number
}

// One in-flight request per company, shared by every component instance —
// products/add.vue renders one Variants.vue per variant, so without this each
// one would fire its own /api/product-custom-fields request.
const inflight = new Map<string, Promise<void>>()

export const useProductCustomFields = () => {
  const auth = useNuxtApp().$auth as any
  const companyId = computed<string>(() => auth?.session?.value?.companyId || 'none')

  // Keyed by company so switching companies (TeamsDropdown) refetches instead
  // of showing the previous company's fields.
  const store = useState<Record<string, ProductCustomFieldDef[]>>('product-custom-fields', () => ({}))

  const fields = computed<ProductCustomFieldDef[]>(() => store.value[companyId.value] || [])
  const productFields = computed(() => fields.value.filter((f) => f.scope === 'PRODUCT' && f.active))
  const variantFields = computed(() => fields.value.filter((f) => f.scope === 'VARIANT' && f.active))

  const load = async (force = false): Promise<void> => {
    const key = companyId.value
    if (!force && store.value[key]) return
    if (!force && inflight.has(key)) return inflight.get(key)

    const request = (async () => {
      try {
        const res: any = await $fetch('/api/product-custom-fields')
        store.value = { ...store.value, [key]: (res?.fields || []) as ProductCustomFieldDef[] }
      } catch {
        // Definitions are optional — never block the product form on them.
        store.value = { ...store.value, [key]: store.value[key] || [] }
      } finally {
        inflight.delete(key)
      }
    })()

    inflight.set(key, request)
    return request
  }

  // Build the value map a form should start from: every active field present,
  // seeded from previously saved values.
  const seedValues = (
    defs: ProductCustomFieldDef[],
    saved: Record<string, any> | null | undefined,
  ): Record<string, any> => {
    const source = saved && typeof saved === 'object' ? saved : {}
    const next: Record<string, any> = {}
    for (const def of defs) next[def.key] = source[def.key] ?? ''
    return next
  }

  return {
    fields,
    productFields,
    variantFields,
    load,
    refresh: () => load(true),
    seedValues,
  }
}
