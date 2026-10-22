export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export interface LabelBox { x: number; y: number; width: number; height: number }

/** Deltas are in paper millimetres, independent of preview zoom. */
export function resizeLabelBox(box: LabelBox, handle: ResizeHandle, dx: number, dy: number, paper: { width: number; height: number }): LabelBox {
  const round = (value: number) => Math.round(value * 10) / 10;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, round(value)));
  let left = box.x, top = box.y, right = box.x + box.width, bottom = box.y + box.height;
  if (handle.includes('w')) left = clamp(left + dx, Math.max(0, right - 100), right - 2);
  if (handle.includes('e')) right = clamp(right + dx, left + 2, Math.min(paper.width, left + 100));
  if (handle.includes('n')) top = clamp(top + dy, Math.max(0, bottom - 100), bottom - 2);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + 2, Math.min(paper.height, top + 100));
  return { x: left, y: top, width: Math.min(round(right - left), paper.width - left), height: Math.min(round(bottom - top), paper.height - top) };
}
