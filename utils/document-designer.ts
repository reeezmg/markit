/** Shared, declarative tools for document editors. Never executes stored markup. */
export const sheetSizes = [
  { value: 'A4', label: 'A4 · 210 × 297 mm', width: 210, height: 297 },
  { value: 'A5', label: 'A5 · 148 × 210 mm', width: 148, height: 210 },
  { value: 'Letter', label: 'Letter · 216 × 279 mm', width: 216, height: 279 },
] as const
export type SheetSize = typeof sheetSizes[number]['value']
export const sheetDimensions = (size?: string) => sheetSizes.find(p => p.value === size) || sheetSizes[0]
export function customSectionText(title: string, body: string, style: string) {
  const lines = body.split('\n').filter(line => line.trim()).map(line => line.replace(/^\s*(?:[•*-]|\d+[.)])\s+/, ''))
  const content = style === 'bullets' ? lines.map(line => `• ${line}`).join('\n') : style === 'numbered' ? lines.map((line, i) => `${i + 1}. ${line}`).join('\n') : body.split('\n').map(line => line.replace(/^\s*(?:[•*-]|\d+[.)])\s+/, '')).join('\n')
  return title.trim() ? `${title.trim()}\n${content}` : content
}
export interface CustomDocumentSection { text: string; heading: boolean; border: boolean }
export interface DesignerOption { value: string; label: string }
