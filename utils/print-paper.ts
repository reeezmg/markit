import type { PrintTemplate } from './print-templates';

export const receiptPaperSizes = [
  { label: '58 mm roll / 48 mm printable', width: 48 },
  { label: '58 mm printable', width: 58 },
  { label: '80 mm roll / 72 mm printable', width: 72 },
  { label: '80 mm printable', width: 80 },
];
export const labelPaperSizes = [[40, 30], [50, 25], [50, 30], [50, 38], [60, 40], [80, 50], [100, 150]]
  .map(([width, height]) => ({ label: `${width} x ${height} mm`, width, height }));

/** Resize geometry, not the preview image. Receipt content still grows vertically. */
export function resizePrintPaper(template: PrintTemplate, width: number, height = template.height): PrintTemplate {
  if (!Number.isFinite(width) || width < 25 || width > 100 || !Number.isFinite(height) || height < 15 || height > 150) throw new Error('Paper must be 25-100 mm wide and 15-150 mm long.');
  const sx = width / template.width;
  const sy = template.kind === 'label' ? height / template.height : 1;
  const fontScale = Math.min(sx, sy);
  return { ...template, width, height, elements: template.elements.map(e => {
    const fontSize = Math.max(6, Math.min(32, e.fontSize * fontScale));
    const w = Math.min(100, width, Math.max(2, e.width * sx));
    const h = Math.min(100, height, Math.max(2, e.height * sy, ['text', 'field'].includes(e.type) ? fontSize * 25.4 / 72 * 1.12 : 0));
    return { ...e, x: Math.max(0, Math.min(width - w, e.x * sx)), y: template.kind === 'label' ? Math.max(0, Math.min(height - h, e.y * sy)) : e.y,
      width: w, height: template.kind === 'label' ? h : e.height, fontSize };
  }) };
}
