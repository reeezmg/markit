// Size labels name what `Item.size` holds for a variant — "Size" for clothing,
// "Shade" for paint, "Thickness" for sheet metal, and so on. The company picks
// the allowed labels in Settings → Store (`variant_inputs.size_labels`); each
// variant then stores its chosen one in `Variant.sizeLabel`.
//
// Unlike billing units these are free text (sellers invent their own), so
// normalizing only trims, drops blanks and de-duplicates — it never filters
// against a fixed vocabulary.

export const DEFAULT_SIZE_LABEL = 'Size'

// Starting suggestions offered in the settings picker. Not a whitelist —
// the select is creatable, so anything the seller types is kept.
export const sizeLabelSuggestions = [
  'Size',
  'Shade',
  'Colour',
  'Thickness',
  'Length',
  'Width',
  'Height',
  'Weight',
  'Grade',
  'Volume',
  'Capacity',
  'Diameter',
  'Density',
  'Material',
  'Finish',
  'Pattern',
  'Flavour',
  'Strength',
  'Model',
  'Variant',
]

export const normalizeSizeLabels = (labels: unknown): string[] => {
  const values = Array.isArray(labels)
    ? labels
    : typeof labels === 'string' && labels.length > 0
      ? [labels]
      : []

  const normalized = values
    .map((label) => (typeof label === 'string' ? label.trim() : ''))
    .filter((label): label is string => label.length > 0)

  return normalized.length ? [...new Set(normalized)] : [DEFAULT_SIZE_LABEL]
}

// The label to show for one variant. Falls back to the company's first
// configured label, then to "Size", so rows saved before this feature (and
// rows from a variant whose label was later removed in settings) still read
// sensibly instead of rendering blank.
export const resolveSizeLabel = (
  variantSizeLabel: unknown,
  companyLabels?: unknown,
): string => {
  if (typeof variantSizeLabel === 'string' && variantSizeLabel.trim()) {
    return variantSizeLabel.trim()
  }
  return normalizeSizeLabels(companyLabels)[0] || DEFAULT_SIZE_LABEL
}
