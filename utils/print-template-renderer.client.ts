import { requireLabelBarcode } from './label-barcode';
import { receiptFinishBytes } from './receipt-finishing';
import JsBarcode from 'jsbarcode';
import { fieldValue, monochromeBytes, type PrintTemplate } from './print-templates';
import { templateSchema, elementIsVisible, elementIsStruck } from './print-templates';
import { tableCellValue, tableColumnLines, tableColumnTotal } from './receipt-table';
import { receiptSummary } from './receipt-summary';
import { loadReceiptTable } from './load-receipt-table.client';
import { h as createVNode, nextTick, render } from 'vue';
import { QrcodeCanvas } from 'qrcode.vue';

export async function renderPrintTemplate(template: PrintTemplate, data: any) {
  template = templateSchema.parse(template);
  if (template.kind === 'receipt') data = await loadReceiptTable(data, template);
  // Canvas uses system fonts below; unrelated page webfonts must not delay printing.
  const scale = Number(template.dpi) / 25.4;
  const width = Math.round(template.width * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = template.kind === 'label' ? Math.round(template.height * scale) : 16000;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Print preview is unavailable');
  const ctx: CanvasRenderingContext2D = context;
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = 'black';
  let cursor = 2 * scale;
  const bounds: { id: string; x: number; y: number; width: number; height: number }[] = [];
  const thermal = template.fontFamily === 'thermal';
  const squeeze = thermal ? 0.78 : 1;
  const leading = thermal ? 1.12 : 1.25;
  const setFont = (font: number, bold: boolean) => { ctx.font = `${bold ? 'bold ' : ''}${font}px ${thermal ? 'Consolas, "Liberation Mono", monospace' : 'Arial, sans-serif'}`; };
  const wrap = (text: string, max: number) => {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const char of paragraph) {
        if (line && ctx.measureText(line + char).width > max) { lines.push(line); line = ''; }
        line += char;
      }
      lines.push(line);
    }
    return lines;
  };
  function drawText(text: string, x: number, y: number, w: number, font: number, bold: boolean, align: string, inverse = false, strike = false) {
    setFont(font, bold);
    ctx.textBaseline = 'top'; ctx.textAlign = align as CanvasTextAlign;
    const lines = wrap(text, w / squeeze);
    const lineHeight = font * leading;
    for (let i = 0; i < lines.length; i++) {
      const anchor = x + (align === 'center' ? w / 2 : align === 'right' ? w : 0);
      const top = y + i * lineHeight;
      if (inverse) {
        const ink = ctx.measureText(lines[i]).width * squeeze;
        ctx.fillStyle = 'black'; ctx.fillRect(anchor - (align === 'center' ? ink / 2 : align === 'right' ? ink : 0) - 1, top, ink + 2, lineHeight);
        ctx.fillStyle = 'white';
      }
      ctx.save(); ctx.translate(anchor, top); ctx.scale(squeeze, 1); ctx.fillText(lines[i], 0, 0); ctx.restore();
      if (strike) {
        const ink = ctx.measureText(lines[i]).width * squeeze;
        ctx.fillRect(anchor - (align === 'center' ? ink / 2 : align === 'right' ? ink : 0), top + font * 0.5, ink, Math.max(1, scale * 0.25));
      }
      ctx.fillStyle = 'black';
    }
    return lines.length * lineHeight;
  }
  function barcode(value: string, x: number, y: number, w: number, h: number) {
    if (template.kind === 'label') value = requireLabelBarcode(value);
    if (!value) return;
    const source = document.createElement('canvas');
    JsBarcode(source, value, { format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 16, margin: 10 });
    if ((source.width / 2) > w) throw new Error('Barcode is too long for this element. Increase its width or shorten the value.');
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.restore();
  }
  for (const element of template.elements) {
    if (!elementIsVisible(element, data)) continue;
    const x = element.x * scale;
    const y = template.kind === 'receipt' ? cursor + (element.gapBefore || 0) * scale : element.y * scale;
    const w = element.width * scale, h = element.height * scale;
    const font = element.fontSize * Number(template.dpi) / 72;
    let used = h;
    if (element.type === 'text' || element.type === 'field') {
      const value = element.type === 'field' && element.field ? fieldValue(data, element.field) : element.text;
      const text = element.type === 'field' && element.field ? (value ? element.text + value : '') : value;
      if (!text && template.kind === 'receipt') continue;
      const height = drawText(text, x, y, w, font, element.bold, element.align, element.inverse, elementIsStruck(element, data));
      if (template.kind === 'label' && height > h + 1) throw new Error('Text exceeds its label box. Increase the box height or reduce the font size.');
      used = Math.max(h, height);
    } else if (element.type === 'line') {
      ctx.fillRect(x, y + h / 2, w, Math.max(1, scale / 5));
      if (element.doubleLine) ctx.fillRect(x, y + h / 2 + scale * 0.5, w, Math.max(1, scale / 5));
    } else if (element.type === 'barcode') {
      const value = element.field ? fieldValue(data, element.field) : element.text;
      barcode(element.field && value ? element.text + value : value, x, y, w, h);
    } else if (element.type === 'qrcode') {
      const field = element.field ? fieldValue(data, element.field) : '';
      const value = element.field ? (field ? element.text + field : '') : element.text;
      if (value) {
        if (value.length > 1000) throw new Error('QR code content is too long. Use a shorter value.');
        const host = document.createElement('div');
        const size = Math.round(Math.min(w, h));
        try {
          render(createVNode(QrcodeCanvas, { value, size, margin: 4, level: 'M' }), host);
          await nextTick();
          const qr = host.querySelector('canvas');
          if (!qr) throw new Error('Could not render QR code');
          ctx.drawImage(qr, x + (w - size) / 2, y, size, size);
        } finally { render(null, host); }
      }
    } else if (element.type === 'logo' && element.image) {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Cannot load logo')); image.src = element.image; });
      const ratio = Math.min(w / image.width, h / image.height);
      ctx.drawImage(image, x + (w - image.width * ratio) / 2, y, image.width * ratio, image.height * ratio);
    } else if (element.type === 'taxsummary') {
      const taxRows = receiptSummary(data).tax;
      if (!taxRows.length) continue;
      let rowY = y;
      const rule = (double = false) => { ctx.fillRect(x, rowY, w, Math.max(1, scale / 6)); if (double) ctx.fillRect(x, rowY + scale * 0.5, w, Math.max(1, scale / 6)); rowY += scale * 2; };
      rule(true);
      rowY += drawText('TAX SUMMARY', x, rowY, w, font, false, 'center', true) + scale;
      const row = (values: string[]) => {
        const fractions = [0, 0.13, 0.43, 0.73];
        rowY += Math.max(...values.map((value, i) => drawText(value, x + w * fractions[i], rowY, w * (i === 0 ? 0.13 : 0.27), font, false, 'left'))) + scale * 0.3;
      };
      row(['TAX', 'SGST', 'CGST', 'TOTAL']); rule();
      for (const tax of taxRows) row([`${tax.rate}%`, tax.sgst.toFixed(2), tax.cgst.toFixed(2), tax.total.toFixed(2)]);
      rule(true); used = Math.max(h, rowY - y);
    } else if (element.type === 'items' && element.columns) {
      const lines = tableColumnLines(element.columns);
      const padding = (element.tablePadding ?? 0.5) * scale;
      let rowY = y;
      const rule = () => {
        if (element.tableDashedRules) {
          for (let offset = 0; offset < w; offset += scale * 1.5) ctx.fillRect(x + offset, rowY + scale * 0.5, Math.min(scale, w - offset), Math.max(1, scale / 6));
        } else ctx.fillRect(x, rowY + scale * 0.5, w, Math.max(1, scale / 6));
        rowY += scale * 2;
      };
      const drawRow = (columns: typeof element.columns, values: string[], header: boolean) => {
        const total = columns.reduce((sum, column) => sum + column.width, 0);
        const widths = columns.map(column => w * column.width / total);
        if (widths.some(width => width <= padding * 2 + font * 0.6 * squeeze)) throw new Error('A table column is too narrow. Increase its width, reduce padding or reduce text size.');
        const bold = header ? element.tableHeaderBold !== false : element.bold;
        setFont(font, bold);
        const rowHeight = Math.max(...values.map((value, i) => wrap(value, (widths[i] - padding * 2) / squeeze).length * font * leading)) + padding * 2;
        if (rowY + rowHeight > 15000) throw new Error('Receipt is too long to render. Reduce the number of items.');
        let columnX = x;
        values.forEach((value, i) => {
          drawText(value, columnX + padding, rowY + padding, widths[i] - padding * 2, font, bold, columns[i].align);
          if (element.tableBorders !== false) { ctx.lineWidth = Math.max(1, scale / 6); ctx.strokeRect(columnX, rowY, widths[i], rowHeight); }
          columnX += widths[i];
        });
        rowY += rowHeight;
      };
      lines.forEach(columns => drawRow(columns, columns.map(column => column.header), true));
      if (element.tableRules) rule();
      (data.entries || []).forEach((entry: any, index: number) => {
        lines.forEach(columns => drawRow(columns, columns.map(column => {
          const value = tableCellValue(entry, column.field, index);
          return value + (value && column.suffix && !value.endsWith(column.suffix) && !(column.field === 'entry.discount' && Number(value) < 0) ? column.suffix : '');
        }), false));
        rowY += (element.tableItemGap ?? 0) * scale;
      });
      if (element.tableTotals) {
        rule();
        lines.filter(columns => columns.some(c => c.total)).forEach(columns => drawRow(columns, columns.map(column => tableColumnTotal(data.entries || [], column)), false));
      }
      if (element.tableRules || element.tableTotals) rule();
      used = Math.max(h, rowY - y);
    } else if (element.type === 'items') {
      let rowY = y;
      const descWidth = w * 0.57, qtyWidth = w * 0.12, amountWidth = w * 0.31;
      rowY += Math.max(drawText('Item / rate / tax', x, rowY, descWidth, font, true, 'left'), drawText('Qty', x + descWidth, rowY, qtyWidth, font, true, 'right'), drawText('Amount', x + descWidth + qtyWidth, rowY, amountWidth, font, true, 'right')) + scale;
      for (const item of data.entries || []) {
        const metadata = [item.size, item.unit, item.hsn ? `HSN ${item.hsn}` : '', item.tax ? `Tax ${item.tax}%` : '', `Rate ${Number(item.mrp || 0).toFixed(2)}`, item.discount ? `Disc ${item.discount}` : ''].filter(Boolean).join(' / ');
        const height = Math.max(drawText(`${item.description || item.name || ''}\n${metadata}`, x, rowY, descWidth, font, element.bold, 'left'), drawText(String(item.qty ?? 0), x + descWidth, rowY, qtyWidth, font, false, 'right'), drawText(Number(item.tvalue ?? item.value ?? 0).toFixed(2), x + descWidth + qtyWidth, rowY, amountWidth, font, false, 'right'));
        rowY += height + scale * 2;
        if (rowY > 15000) throw new Error('Receipt is too long to render. Reduce the number of items.');
      }
      used = Math.max(h, rowY - y);
    }
    bounds.push({ id: element.id, x: x / scale, y: y / scale, width: element.width, height: used / scale });
    if (template.kind === 'receipt') cursor = y + used + (element.gapAfter ?? 1) * scale;
    if (cursor > 15000) throw new Error('Receipt is too long to render. Reduce content or font sizes.');
  }
  if (template.kind === 'receipt') {
    // Earned vouchers remain part of the receipt regardless of the selected design.
    for (const coupon of data.generatedCoupons || []) {
      const details = [`Coupon: ${coupon.code}`, coupon.type === 'PERCENTAGE' ? `${coupon.discountValue}% off${coupon.maxDiscountAmount ? ` (max ${Number(coupon.maxDiscountAmount).toFixed(2)})` : ''}` : coupon.type === 'FLAT' ? `${Number(coupon.discountValue || 0).toFixed(2)} off` : 'Gift coupon'];
      if (coupon.minOrderValue) details.push(`Min order: ${Number(coupon.minOrderValue).toFixed(2)}`);
      if (coupon.endDate) details.push(`Valid till: ${new Date(coupon.endDate).toLocaleDateString('en-IN')}`);
      cursor += drawText(details.join('\n'), 2 * scale, cursor, (template.width - 4) * scale, 10 * Number(template.dpi) / 72, true, 'center') + scale;
      barcode(coupon.code, 2 * scale, cursor, (template.width - 4) * scale, 18 * scale);
      cursor += 20 * scale;
      if (cursor > 15000) throw new Error('Receipt is too long to render.');
    }
    const cropped = document.createElement('canvas'); cropped.width = width; cropped.height = Math.ceil(cursor + 2 * scale);
    cropped.getContext('2d')!.drawImage(canvas, 0, 0);
    return finish(cropped, template, bounds);
  }
  return finish(canvas, template, bounds);
}

function finish(canvas: HTMLCanvasElement, template: PrintTemplate, bounds: any[]) {
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Preview and PDF show the same monochrome pixels sent to the thermal printer.
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3 < 128 ? 0 : 255;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return { canvas, bounds, width: template.width, height: template.kind === 'label' ? template.height : canvas.height * 25.4 / Number(template.dpi) };
}

export function templatePrintBytes(rendered: Awaited<ReturnType<typeof renderPrintTemplate>>, template: PrintTemplate, language: 'tspl' | 'cpcl' = 'tspl') {
  const { canvas } = rendered;
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  const encode = (value: string) => new TextEncoder().encode(value);
  const parts: Uint8Array[] = [];
  const stride = Math.ceil(canvas.width / 8);
  // CPCL CG takes stride * height raw bytes (1 = black), followed by CRLF.
  // https://www.zebra.com/content/dam/support-dam/en/documentation/unrestricted/guide/software/cpcl-link-os-pg-en.pdf (section 6.7)
  if (template.kind === 'label' && language === 'cpcl') {
    parts.push(encode(`! 0 ${template.dpi} ${template.dpi} ${canvas.height} 1\r\nPAGE-WIDTH ${canvas.width}\r\nCG ${stride} ${canvas.height} 0 0 `));
    parts.push(monochromeBytes(pixels, canvas.width, canvas.height), encode('\r\nFORM\r\nPRINT\r\n'));
  } else if (template.kind === 'label') {
    parts.push(encode(`SIZE ${template.width} mm,${template.height} mm\r\nGAP 2 mm,0 mm\r\nDIRECTION 1\r\nCLS\r\nBITMAP 0,0,${stride},${canvas.height},0,`));
    parts.push(monochromeBytes(pixels, canvas.width, canvas.height, true), encode('\r\nPRINT 1,1\r\n'));
  } else {
    parts.push(Uint8Array.from([27, 64]));
    // Small raster bands avoid printer buffer limits on long receipts.
    for (let y = 0; y < canvas.height; y += 128) {
      const height = Math.min(128, canvas.height - y);
      parts.push(Uint8Array.from([29, 118, 48, 0, stride & 255, stride >> 8, height & 255, height >> 8]));
      parts.push(monochromeBytes(pixels.subarray(y * canvas.width * 4, (y + height) * canvas.width * 4), canvas.width, height));
    }
    parts.push(Uint8Array.from(receiptFinishBytes()));
  }
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

export async function renderedTemplatePDF(rendered: Awaited<ReturnType<typeof renderPrintTemplate>>) {
  if (rendered.height > 1400) throw new Error('Receipt exceeds the PDF page limit. Print it directly or reduce content.');
  // The renderer is also imported during SSR; load the PDF library only for a browser download.
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: [rendered.width, rendered.height], orientation: rendered.width > rendered.height ? 'landscape' : 'portrait' });
  pdf.addImage(rendered.canvas.toDataURL('image/png'), 'PNG', 0, 0, rendered.width, rendered.height);
  return pdf;
}

export async function createTemplatePDF(template: PrintTemplate, data: any) {
  return renderedTemplatePDF(await renderPrintTemplate(template, data));
}

export async function downloadTemplatePDF(template: PrintTemplate, data: any, filename = 'receipt.pdf') {
  const pdf = await createTemplatePDF(template, data);
  pdf.save(filename);
}

