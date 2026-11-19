import { watch, onBeforeUnmount, type Ref } from 'vue'

/** Keep immediate local filtering while searching beyond the API's first result set. */
export function useAfterSalesSearch(query: Ref<string>, load: () => Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(query, () => { clearTimeout(timer); timer = setTimeout(() => { void load() }, 300) })
  onBeforeUnmount(() => clearTimeout(timer))
}
