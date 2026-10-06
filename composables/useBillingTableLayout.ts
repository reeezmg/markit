import { computed, ref, watch, type Ref } from 'vue'

/** Keep enough table space for its header and one row at any zoom/font size. */
export function useBillingTableLayout(table: Ref<HTMLTableElement | null>) {
  const minimumHeight = ref(96)
  const minimumCardHeight = ref(0)

  watch(table, (element, _previous, onCleanup) => {
    if (!element) return

    const measure = () => {
      const header = element.tHead
      const row = element.tBodies[0]?.rows[0]
      const container = element.parentElement
      if (!header || !row || !container) return
      const style = getComputedStyle(container)
      const height = header.getBoundingClientRect().height + row.getBoundingClientRect().height
        + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      if (height > 0) minimumHeight.value = Math.ceil(height) + 1

      const body = container.parentElement
      const card = body?.parentElement
      if (!body || !card) return
      const cardStyle = getComputedStyle(card)
      minimumCardHeight.value = Math.ceil(minimumHeight.value
        + (body.previousElementSibling?.getBoundingClientRect().height || 0)
        + (body.nextElementSibling?.getBoundingClientRect().height || 0)
        + parseFloat(cardStyle.borderTopWidth) + parseFloat(cardStyle.borderBottomWidth))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (element.tHead) observer.observe(element.tHead)
    const body = element.parentElement?.parentElement
    if (body?.previousElementSibling) observer.observe(body.previousElementSibling)
    if (body?.nextElementSibling) observer.observe(body.nextElementSibling)
    onCleanup(() => observer.disconnect())
  }, { flush: 'post' })

  return computed(() => ({
    '--billing-table-min-height': `${minimumHeight.value}px`,
    '--billing-card-min-height': `${minimumCardHeight.value}px`,
  }))
}
