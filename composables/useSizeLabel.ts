import {
  DEFAULT_SIZE_LABEL,
  normalizeSizeLabels,
  resolveSizeLabel,
} from '~/utils/size-labels'

// Single place every screen reads the "what is this attribute called" label
// from. Mirrors how `unit` works for qty:
//   • the company configures the allowed labels in Settings → Store
//   • a variant stores its pick in `Variant.sizeLabel`
//   • when only one label is configured the product form hides the picker and
//     applies that label silently (`showSizeLabelSelect === false`)
export const useSizeLabel = () => {
  const auth = useNuxtApp().$auth as any

  const sizeLabels = computed<string[]>(() =>
    normalizeSizeLabels(auth?.session?.value?.variantInputs?.sizeLabels),
  )

  // What a brand-new variant gets, and what table headers fall back to.
  const defaultSizeLabel = computed<string>(() => sizeLabels.value[0] || DEFAULT_SIZE_LABEL)

  // Only worth asking the seller when there is an actual choice to make.
  const showSizeLabelSelect = computed<boolean>(() => sizeLabels.value.length > 1)

  // Label for one variant/entry. Accepts either the raw string or any object
  // carrying `sizeLabel` (variant, bill entry, cart line, barcode item).
  const labelFor = (source: any): string => {
    const raw = typeof source === 'string' ? source : source?.sizeLabel
    return resolveSizeLabel(raw, sizeLabels.value)
  }

  return { sizeLabels, defaultSizeLabel, showSizeLabelSelect, labelFor }
}
