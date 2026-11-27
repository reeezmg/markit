import { z } from 'zod'

export const conditionOperators = ['filled', 'empty', 'eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains'] as const
export const ruleActions = ['show', 'hide', 'strike', 'bold', 'italic', 'underline', 'color', 'background', 'borderColor'] as const
export const designerRuleSchema = z.object({
  id: z.string().min(1).max(80), match: z.enum(['all', 'any']),
  conditions: z.array(z.object({ field: z.string().min(1).max(100), operator: z.enum(conditionOperators), source: z.enum(['value', 'field']), value: z.string().max(2000) })).min(1).max(8),
  action: z.enum(ruleActions), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).superRefine((rule, ctx) => {
  if (['color', 'background', 'borderColor'].includes(rule.action) && !rule.color) ctx.addIssue({code:'custom',message:'Choose an action colour',path:['color']})
  rule.conditions.forEach((condition, index) => {
    if (!['filled', 'empty'].includes(condition.operator) && condition.source === 'field' && !condition.value.trim()) ctx.addIssue({code:'custom',message:'Choose the comparison field',path:['conditions',index,'value']})
  })
})
export type DesignerRule = z.infer<typeof designerRuleSchema>
export type RuleLayer = { rules?: DesignerRule[]; kind?: string; type?: string; visible?: boolean; strike?: boolean; bold?: boolean; fontWeight?: number; italic?: boolean; underline?: boolean; color?: string; background?: string; borderColor?: string; fills?: unknown; fillVisible?: boolean; fillOpacity?: number; backgroundVisible?: boolean; backgroundOpacity?: number }
export type RuleResolver = (field: string) => unknown
const text = (value: unknown) => value == null ? '' : String(value).trim()
export function conditionNumber(value: unknown): number | undefined {
  if (!text(value)) return undefined
  // Support formatted document currency/percent fields without coercing arbitrary text to zero.
  const clean = text(value).replace(/\u2212/g, '-').replace(/[\p{Sc},\s]/gu, '').replace(/%$/, '')
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean)) return undefined
  const number = Number(clean); return Number.isFinite(number) ? number : undefined
}
export function ruleMatches(rule: DesignerRule, resolve: RuleResolver): boolean {
  const results = rule.conditions.map(condition => {
    const left = resolve(condition.field), right = condition.source === 'field' ? resolve(condition.value) : condition.value
    if (condition.operator === 'filled') return !!text(left)
    if (condition.operator === 'empty') return !text(left)
    if (['eq', 'neq'].includes(condition.operator)) {
      const a = conditionNumber(left), b = conditionNumber(right)
      const equal = a !== undefined && b !== undefined ? a === b : text(left).toLowerCase() === text(right).toLowerCase()
      return condition.operator === 'eq' ? equal : !equal
    }
    if (condition.operator === 'contains') return text(left).toLowerCase().includes(text(right).toLowerCase())
    const a = conditionNumber(left), b = conditionNumber(right)
    if (a === undefined || b === undefined) return false
    return condition.operator === 'lt' ? a < b : condition.operator === 'lte' ? a <= b : condition.operator === 'gt' ? a > b : a >= b
  })
  return rule.match === 'all' ? results.every(Boolean) : results.some(Boolean)
}
/** Rules never mutate saved layers. Visibility gates combine; later matching paint rules win. */
export function applyDesignerRules<T extends RuleLayer>(layer: T, resolve: RuleResolver, textLayer = ['text','field'].includes(layer.type || layer.kind || '')): T {
  if (!layer.rules?.length) return layer
  const result = { ...layer }
  for (const rule of layer.rules) {
    const matches = ruleMatches(rule, resolve)
    if (rule.action === 'show') { if (!matches) result.visible = false; continue }
    if (!matches) continue
    if (rule.action === 'hide') result.visible = false
    else if (rule.action === 'strike') result.strike = true
    else if (rule.action === 'bold') { result.bold = true; result.fontWeight = 700 }
    else if (rule.action === 'italic') result.italic = true
    else if (rule.action === 'underline') result.underline = true
    else if (rule.action === 'color') { result.color = rule.color; result.fills = undefined; result.fillVisible = true; result.fillOpacity = 1 }
    else if (rule.action === 'background') { result.background = rule.color; result.backgroundVisible = true; result.backgroundOpacity = 1; if (!textLayer) { result.fills = undefined; result.fillVisible = true; result.fillOpacity = 1 } }
    else if (rule.action === 'borderColor') result.borderColor = rule.color
  }
  return result
}

/** Legacy discount behavior expressed with ordinary field comparisons. Zero is a valid sale price. */
export function priceComparisonRule(action: DesignerRule['action'], id = 'price-comparison'): DesignerRule {
  return { id, match: 'all', action, conditions: [
    {field:'sprice',operator:'filled',source:'value',value:''}, {field:'dprice',operator:'filled',source:'value',value:''},
    {field:'dprice',operator:'gte',source:'value',value:'0'}, {field:'dprice',operator:'lt',source:'field',value:'sprice'},
  ] }
}
