import { quoteLayerDefinitions } from './quote-layer-definitions'

/** Required totals/items and ancestors of protected document values cannot be conditionally hidden. */
export function quoteRulesProtected(section: {kind: string; role?: string; elements?: {key: string; parent?: string}[]}, key = ''): boolean {
  if (!key && ['items','totals'].includes(section.kind)) return true
  const definitions = quoteLayerDefinitions(section.kind, section.role)
  return definitions.filter(node => node.protected).some(node => {
    let current: string | undefined = node.key
    const seen = new Set<string>()
    while (current && !seen.has(current)) {
      if (current === key) return true
      seen.add(current)
      current = definitions.find(value => value.key === current)?.parent || section.elements?.find(value => value.key === current)?.parent
    }
    return !key
  })
}
