/** Geometry shared by canvas gestures and inspector commands; units are millimetres. */
export interface DesignerBox { x: number; y: number; width: number; height: number }
export interface DesignerGuide { axis: 'x' | 'y'; value: number }
export const roundMM = (value: number) => Math.round(value * 100) / 100
export function boxUnion(boxes: DesignerBox[]): DesignerBox {
  if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y))
  return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y }
}
export function constrainBox(box: DesignerBox, width: number, height: number): DesignerBox {
  const w = Math.max(1, Math.min(width, box.width)), h = Math.max(1, Math.min(height, box.height))
  return { x: roundMM(Math.max(0, Math.min(width - w, box.x))), y: roundMM(Math.max(0, Math.min(height - h, box.y))), width: roundMM(w), height: roundMM(h) }
}
export function resizeBox(box: DesignerBox, handle: string, dx: number, dy: number, ratio = false, fromCenter = false): DesignerBox {
  let left = box.x, right = box.x + box.width, top = box.y, bottom = box.y + box.height
  if (handle.includes('e')) right = Math.max(left + 1, right + dx)
  if (handle.includes('w')) left = Math.min(right - 1, left + dx)
  if (handle.includes('s')) bottom = Math.max(top + 1, bottom + dy)
  if (handle.includes('n')) top = Math.min(bottom - 1, top + dy)
  if (ratio) {
    const aspect = box.width / box.height
    if (handle === 'n' || handle === 's' || Math.abs(dy / box.height) > Math.abs(dx / box.width)) {
      const w = (bottom - top) * aspect
      if (handle.includes('w')) left = right - w; else right = left + w
    } else {
      const h = (right - left) / aspect
      if (handle.includes('n')) top = bottom - h; else bottom = top + h
    }
  }
  const width = right - left, height = bottom - top
  return { x: fromCenter ? box.x + (box.width - width) / 2 : left, y: fromCenter ? box.y + (box.height - height) / 2 : top, width, height }
}
export function snapBox(box: DesignerBox, targets: DesignerBox[], page: { width: number; height: number }, tolerance: number, grid = 0) {
  const guides: DesignerGuide[] = [], result = { ...box }
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'width' : 'height'
    const candidates = [0, page[size] / 2, page[size], ...targets.flatMap(b => [b[axis], b[axis] + b[size] / 2, b[axis] + b[size]])]
    let distance = tolerance + .001, delta = 0, guide: number | undefined
    for (const own of [box[axis], box[axis] + box[size] / 2, box[axis] + box[size]]) for (const candidate of candidates) {
      if (Math.abs(candidate - own) < distance) { distance = Math.abs(candidate - own); delta = candidate - own; guide = candidate }
    }
    if (guide !== undefined) { result[axis] += delta; guides.push({ axis, value: guide }) }
    else if (grid) result[axis] = Math.round(result[axis] / grid) * grid
  }
  return { box: result, guides }
}
export function transformBoxes(boxes: DesignerBox[], from: DesignerBox, to: DesignerBox): DesignerBox[] {
  return boxes.map(box => ({ x: to.x + (box.x - from.x) * to.width / from.width, y: to.y + (box.y - from.y) * to.height / from.height,
    width: box.width * to.width / from.width, height: box.height * to.height / from.height }))
}
