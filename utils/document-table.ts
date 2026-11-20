import { z } from 'zod'

/** Optional presentation only; absent properties preserve existing layouts. */
export const documentTableStyleSchema = z.object({
  rowHeight: z.number().min(0).max(100).optional(),
  headerHeight: z.number().min(0).max(40).optional(),
  cellPadding: z.number().min(0).max(10).optional(),
  fontSize: z.number().min(6).max(32).optional(),
  headerFontSize: z.number().min(6).max(32).optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  borderWidth: z.number().min(0.1).max(2).optional(),
  imageWidth: z.number().min(5).max(80).optional(),
  imageHeight: z.number().min(5).max(80).optional(),
  imageFit: z.enum(['contain', 'cover']).optional(),
  imagePlacement: z.enum(['beside', 'above']).optional(),
})
export type DocumentTableStyle = z.infer<typeof documentTableStyleSchema>
export function columnPercentage(columns: { width: number }[], index: number) {
  const total = columns.reduce((sum, column) => sum + column.width, 0)
  return total && columns[index] ? columns[index].width / total * 100 : 0
}
export function setColumnPercentage(columns: { width: number }[], index: number, percent: number, minimum = 1) {
  if (!columns[index] || !Number.isFinite(percent)) return
  const others = columns.filter((_, i) => i !== index)
  if (!others.length) { columns[index].width = 100; return }
  const width = Math.max(minimum, Math.min(100 - others.length * minimum, percent))
  let remaining = 100 - width, free = [...others]
  const weights = new Map(others.map(column => [column, column.width]))
  while (free.length) {
    const total = free.reduce((sum, column) => sum + weights.get(column)!, 0)
    const small = free.filter(column => remaining * (total ? weights.get(column)! / total : 1 / free.length) < minimum)
    if (!small.length) {
      free.forEach(column => { column.width = remaining * (total ? weights.get(column)! / total : 1 / free.length) }); break
    }
    small.forEach(column => { column.width = minimum; remaining -= minimum })
    free = free.filter(column => !small.includes(column))
  }
  columns[index].width = width
}
/** A divider drag resizes only its two neighbours, keeping the table width fixed. */
export function resizeAdjacentColumns<T extends { width: number }>(columns: T[], index: number, delta: number, minimum = 3): T[] {
  const result = columns.map((column, i) => ({ ...column, width: columnPercentage(columns, i) }))
  result.forEach((column, i) => { if (column.width < minimum) setColumnPercentage(result, i, minimum, minimum) })
  if (!result[index + 1] || !Number.isFinite(delta)) return result
  const pair = result[index].width + result[index + 1].width
  const width = Math.max(minimum, Math.min(pair - minimum, result[index].width + delta))
  result[index].width = width; result[index + 1].width = pair - width
  return result
}
