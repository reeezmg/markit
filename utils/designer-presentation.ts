import { z } from 'zod'
import { designerRuleSchema } from './designer-rules'

export const designerFonts = ['Arial', 'Georgia', 'Verdana', 'Tahoma', 'Times New Roman', 'Courier New'] as const
export const designerFillSchema = z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/), opacity: z.number().min(0).max(1), visible: z.boolean() })
export type DesignerFill = z.infer<typeof designerFillSchema>
const millimetres = () => z.number().min(0).max(100)
export const designerCornersSchema = z.object({ topLeft: millimetres(), topRight: millimetres(), bottomRight: millimetres(), bottomLeft: millimetres() })
export const designerSidesSchema = z.object({ top: millimetres(), right: millimetres(), bottom: millimetres(), left: millimetres() })
const marginValue = () => z.number().min(-300).max(300)
export const designerMarginSidesSchema = z.object({ top: marginValue(), right: marginValue(), bottom: marginValue(), left: marginValue() })
type BoxPresentation = { radius?: number; cornerRadii?: z.infer<typeof designerCornersSchema>; padding?: number; paddingSides?: z.infer<typeof designerSidesSchema>; margin?: number; marginSides?: z.infer<typeof designerMarginSidesSchema>; shape?: string }
/** CSS/canvas order: top left, top right, bottom right, bottom left. */
export function layerCornerRadii(layer: BoxPresentation): [number, number, number, number] {
  const c = layer.cornerRadii, all = layer.radius ?? 0
  return c ? [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft] : [all, all, all, all]
}
/** CSS order: top, right, bottom, left. Explicit zero overrides a unified value. */
export function layerPadding(layer: BoxPresentation): [number, number, number, number] {
  const p = layer.paddingSides, all = layer.padding ?? 0
  return p ? [p.top, p.right, p.bottom, p.left] : [all, all, all, all]
}
export function layerMargins(layer: BoxPresentation, fallback: [number, number, number, number] = [0, 0, 0, 0]): [number, number, number, number] {
  const m = layer.marginSides, all = layer.margin
  return m ? [m.top, m.right, m.bottom, m.left] : all !== undefined ? [all, all, all, all] : fallback
}
export function layerBoxStyle(layer: BoxPresentation) {
  return {
    borderRadius: layer.shape === 'ellipse' ? '50%' : layer.cornerRadii || layer.radius !== undefined ? layerCornerRadii(layer).map(n => `${n}mm`).join(' ') : undefined,
    padding: layer.paddingSides || layer.padding !== undefined ? layerPadding(layer).map(n => `${n}mm`).join(' ') : undefined,
    ...(layer.marginSides || layer.margin !== undefined ? { margin: layerMargins(layer).map(n => `${n}mm`).join(' ') } : {}),
  }
}
/** Optional version-one presentation fields shared by the DOM and raster adapters. */
export const designerPresentationFields = {
  rules: z.array(designerRuleSchema).max(16).refine(rules => new Set(rules.map(rule => rule.id)).size === rules.length, 'Rule IDs must be unique').optional(),
  strike: z.boolean().optional(),
  cornerRadii: designerCornersSchema.optional(),
  padding: millimetres().optional(),
  paddingSides: designerSidesSchema.optional(),
  margin: marginValue().optional(),
  marginSides: designerMarginSidesSchema.optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  letterSpacingUnit: z.enum(['absolute', 'percent']).optional(),
  textVerticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  resizeMode: z.enum(['auto-width', 'auto-height', 'fixed']).optional(),
  aspectLocked: z.boolean().optional(),
  fillVisible: z.boolean().optional(),
  fillOpacity: z.number().min(0).max(1).optional(),
  backgroundOpacity: z.number().min(0).max(1).optional(),
  backgroundVisible: z.boolean().optional(),
  fills: z.array(designerFillSchema).max(8).optional(),
}
/** Solid fills share one shape; compose them from back to front for both renderers. */
export function compositeFills(fills: DesignerFill[]) {
  let alpha = 0, rgb = [0, 0, 0]
  for (const fill of [...fills].reverse()) {
    const opacity = fill.visible ? fill.opacity : 0, next = opacity + alpha * (1 - opacity)
    if (next) rgb = rgb.map((value, i) => (parseInt(fill.color.slice(1 + i * 2, 3 + i * 2), 16) * opacity + value * alpha * (1 - opacity)) / next)
    alpha = next
  }
  const color = '#' + rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')
  return { color, opacity: alpha, css: paintColor(color, alpha), visible: alpha > 0 }
}
export function paintColor(color: string | undefined, opacity = 1, visible = true) {
  if (!visible) return 'transparent'
  if (!color || color === 'transparent' || opacity === 1) return color
  const hex = color.replace('#', '')
  return `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${opacity})`
}
export function absoluteLetterSpacing(value = 0, unit?: string, fontSize = 12) {
  return unit === 'percent' ? value * fontSize / 100 : value
}
export function verticalTextOffset(available: number, content: number, align?: string) {
  return Math.max(0, available - content) * (align === 'bottom' ? 1 : align === 'middle' ? .5 : 0)
}
export function transformLayerVector(parents: { rotation?: number; flipX?: boolean; flipY?: boolean }[], x: number, y: number, inverse = false) {
  for (const parent of inverse ? parents : [...parents].reverse()) {
    const angle = (parent.rotation || 0) * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle)
    if (inverse) { const nextX = x * cosine + y * sine; y = (-x * sine + y * cosine) * (parent.flipY ? -1 : 1); x = nextX * (parent.flipX ? -1 : 1) }
    else { x *= parent.flipX ? -1 : 1; y *= parent.flipY ? -1 : 1; const nextX = x * cosine - y * sine; y = x * sine + y * cosine; x = nextX }
  }
  return { x, y }
}
