import { noTaxReceiptDocument } from './no-tax-receipt';
import type { PrintTemplate } from './print-templates';
export async function downloadTemplateHtml(data: any, template: PrintTemplate) {
  const { renderPrintTemplate } = await import('./print-template-renderer.client');
  const result = await renderPrintTemplate(template, data);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Receipt</title><style>body{margin:0;background:white}img{display:block;width:${result.width}mm;height:${result.height}mm;margin:auto}@media print{@page{margin:0;size:${result.width}mm ${result.height}mm}}</style></head><body><img alt="Receipt" src="${result.canvas.toDataURL('image/png')}"></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'receipt.html'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadNoTaxReceiptHtml(data: any) {
  const url = URL.createObjectURL(new Blob([noTaxReceiptDocument(data)], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'no-tax-receipt.html'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
