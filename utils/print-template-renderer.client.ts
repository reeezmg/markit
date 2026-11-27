import { absoluteLetterSpacing, verticalTextOffset, compositeFills, layerCornerRadii, layerPadding } from './designer-presentation';
import { quoteDocumentImage } from './quote-document';
import type { PrintElement } from './print-templates';
import { requireLabelBarcode } from './label-barcode';
import { receiptFinishBytes } from './receipt-finishing';
import JsBarcode from 'jsbarcode';
import { fieldValue, monochromeBytes, type PrintTemplate } from './print-templates';
import { templateSchema, elementIsVisible, elementIsStruck, printElementValue, printElementMargins } from './print-templates';
import { tableCellValue, tableColumnLines, tableColumnTotal } from './receipt-table';
import { receiptSummary } from './receipt-summary';
import { loadReceiptTable } from './load-receipt-table.client';
import { h as createVNode, nextTick, render } from 'vue';
import { QrcodeCanvas } from 'qrcode.vue';
import { billDocumentLines } from './invoice-flow';
import { barcodeFormatInfo } from './print-codes';
import { effectivePrintElement } from './print-templates';

type PrintLayerBounds = { id: string; x: number; y: number; width: number; height: number };

export async function renderPrintTemplate(template: PrintTemplate, data: any, options: { mode?: 'design' | 'print' } = {}) {
  template = templateSchema.parse(template);
  if (template.kind === 'receipt') data = await loadReceiptTable(data, template);
  template = { ...template, elements: template.elements.map(element => effectivePrintElement(element, data)) };
  // Canvas uses system fonts below; unrelated page webfonts must not delay printing.
  const scale = Number(template.dpi) / 25.4;
  const width = Math.round(template.width * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = template.kind === 'label' ? Math.round(template.height * scale) : template.paperSize ? Math.ceil(template.height * scale) + 512 : 16000;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Print preview is unavailable');
  const ctx: CanvasRenderingContext2D = context;
  function ensureCanvasHeight(required: number) {
    if (required <= canvas.height || template.kind === 'label') return;
    if (required > 15500) throw new Error('Receipt is too long to render. Reduce content.');
    const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height; copy.getContext('2d')!.drawImage(canvas, 0, 0);
    const transform = ctx.getTransform();
    const state = { font: ctx.font, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline, fillStyle: ctx.fillStyle, lineWidth: ctx.lineWidth, strokeStyle: ctx.strokeStyle, globalAlpha: ctx.globalAlpha };
    canvas.height = Math.min(16000, Math.ceil(Math.max(required + 256, canvas.height * 1.5)));
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(copy, 0, 0); Object.assign(ctx, state); ctx.setTransform(transform);
    copy.width = 0; copy.height = 0;
  }
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = 'black';
  let cursor = 2 * scale;
  let flowBottom = 0;
  let imageBottom = 0;
  const pageBreaks: number[] = [];
  const bounds: PrintLayerBounds[] = [], emptyBounds: PrintLayerBounds[] = [];
  function layerBounds(id: string, x: number, y: number, width: number, height: number): PrintLayerBounds {
    const center = ctx.getTransform().transformPoint({ x: x + width / 2, y: y + height / 2 });
    const mm = (value: number) => Math.round(value / scale * 1e6) / 1e6;
    return { id, x: mm(center.x - width / 2), y: mm(center.y - height / 2), width: mm(width), height: mm(height) };
  }
  const thermal = template.fontFamily === 'thermal';
  const squeeze = thermal ? 0.78 : 1;
  const leading = thermal ? 1.12 : 1.25;
  let activeElement: PrintElement | undefined;
  const textPaint = () => {
    const text = activeElement && ['text', 'field'].includes(activeElement.type);
    return text && activeElement?.fills ? compositeFills(activeElement.fills) : { color: activeElement?.color || 'black', opacity: text ? activeElement?.fillOpacity ?? 1 : 1, visible: !text || activeElement?.fillVisible !== false };
  };
  const setFont = (font: number, bold: boolean) => {
    const weight = bold && !activeElement?.bold ? Math.max(700, activeElement?.fontWeight || 400) : activeElement?.fontWeight ?? (bold ? 700 : 400);
    const family = activeElement?.fontFamily ? JSON.stringify(activeElement.fontFamily) : thermal ? 'Consolas, "Liberation Mono", monospace' : 'Arial, sans-serif';
    ctx.font = `${activeElement?.italic ? 'italic ' : ''}${weight} ${font}px ${family}`;
    (ctx as any).letterSpacing = `${absoluteLetterSpacing(activeElement?.letterSpacing, activeElement?.letterSpacingUnit, font * 72 / Number(template.dpi)) * Number(template.dpi) / 72}px`;
  };
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
    const lineHeight = font * (activeElement?.lineHeight || leading);
    ensureCanvasHeight(y + lines.length * lineHeight + 2 * scale);
    const alpha = ctx.globalAlpha, fill = textPaint(); ctx.fillStyle = fill.color;
    ctx.globalAlpha *= fill.visible ? fill.opacity : 0;
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
      if (activeElement?.underline) { const ink = ctx.measureText(lines[i]).width * squeeze; ctx.fillRect(anchor - (align === 'center' ? ink / 2 : align === 'right' ? ink : 0), top + font, ink, Math.max(1, scale * .15)); }
      ctx.fillStyle = fill.color;
    }
    ctx.globalAlpha = alpha;
    return lines.length * lineHeight;
  }
  function barcode(value: string, x: number, y: number, w: number, h: number, element?: PrintElement) {
    ensureCanvasHeight(y + h + 2 * scale);
    if (template.kind === 'label') value = requireLabelBarcode(value);
    if (!value) return;
    const source = document.createElement('canvas');
    const format = barcodeFormatInfo(element?.barcodeFormat);
    try { JsBarcode(source, value, { format: format.value, width: 2, height: 60, displayValue: element?.barcodeDisplayValue !== false, fontSize: 16, margin: 10 }); }
    catch { throw new Error(`${format.label}: invalid code value. ${format.hint}`); }
    if ((source.width / 2) > w) throw new Error('Barcode is too long for this element. Increase its width or shorten the value.');
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.restore();
  }
  const elements = [...template.elements.filter(e => !e.parentId && e.placement !== 'absolute'), ...template.elements.filter(e => !e.parentId && e.placement === 'absolute')];
  async function drawElements(elements: PrintElement[], parent?: { x: number; y: number; width: number; height: number }): Promise<number> {
  let localBottom = parent?.y || 0;
  for (const element of elements) {
    if (!elementIsVisible(element, data)) continue;
    const floating = template.kind === 'receipt' && (element.placement === 'absolute' || !!parent);
    const [marginTop, marginRight, marginBottom, marginLeft] = printElementMargins(element, template.kind === 'receipt' && !floating).map(value => value * scale);
    let x = (parent?.x || 0) + element.x * scale + marginLeft;
    let y = parent ? parent.y + element.y * scale + marginTop : template.kind === 'receipt' && !floating ? Math.max(0, cursor + marginTop) : element.y * scale + marginTop;
    let w = element.width * scale, h = element.height * scale;
    ensureCanvasHeight(y + h + 2 * scale);
    const font = element.fontSize * Number(template.dpi) / 72;
    let used = h;
    const previous = activeElement, previousTransform = ctx.getTransform(), previousAlpha = ctx.globalAlpha; activeElement = element; ctx.save();
    try {
    ctx.globalAlpha *= element.opacity ?? 1; ctx.fillStyle = element.color || 'black';
    const textElement = ['text', 'field'].includes(element.type), textValue = textElement ? printElementValue(element, data) : '';
    const autoText = textElement && ['auto-width', 'auto-height'].includes(element.resizeMode || '');
    const paintedTextBox = (!!element.background && element.background !== 'transparent' && element.backgroundVisible !== false && (element.backgroundOpacity ?? 1) > 0) || !!element.border || !!element.borderWidth;
    if (textElement && template.kind === 'receipt' && !textValue && !paintedTextBox) {
      // Collapsed text still needs an accurate editor selection at its flow position.
      emptyBounds.push(layerBounds(element.id, x, y, w, h));
      continue;
    }
    // Fixed frame children keep parent-relative coordinates. Padding insets leaf content.
    const paddedContent = !['frame', 'shape', 'line', 'spacer'].includes(element.type);
    const [padTop, padRight, padBottom, padLeft] = paddedContent ? layerPadding(element).map(value => value * scale) : [0, 0, 0, 0];
    const radii = layerCornerRadii(element).map(value => value * scale);
    if (autoText && textValue) {
      setFont(font, element.bold);
      const content = printElementValue(element, data), inset = element.border ? scale : 0;
      if (element.resizeMode === 'auto-width') w = Math.max(2 * scale, ...content.split('\n').map(line => ctx.measureText(line).width * squeeze + inset * 2 + padLeft + padRight + .1));
      h = Math.max(2 * scale, wrap(content, Math.max(1, w - inset * 2 - padLeft - padRight) / squeeze).length * font * (element.lineHeight || leading) + inset * 2 + padTop + padBottom);
    }
    if (autoText && !parent && template.paperSize && element.placement === 'absolute' && y + h + Math.max(0, marginBottom) > template.height * scale + .5) throw new Error('Place auto-sized fixed text inside the first sheet.');
    if (autoText && (parent ? element.x * scale + marginLeft + w + Math.max(0, marginRight) > parent.width + .5 || element.y * scale + marginTop + h + Math.max(0, marginBottom) > parent.height + .5 : x + w + Math.max(0, marginRight) > canvas.width + .5)) throw new Error('Auto-sized text exceeds its container. Use auto height, a smaller font or a larger frame.');
    ensureCanvasHeight(y + h + 2 * scale);
    ctx.translate(x + w / 2, y + h / 2); ctx.rotate((element.rotation || 0) * Math.PI / 180); ctx.scale(element.flipX ? -1 : 1, element.flipY ? -1 : 1); ctx.translate(-x - w / 2, -y - h / 2);
    if (autoText) used = h;
    const fill = element.fills ? compositeFills(element.fills) : { color: element.background ?? (element.type === 'line' ? element.color || '#000000' : element.type === 'shape' ? element.color || '#e2e8f0' : undefined), opacity: element.fillOpacity ?? 1, visible: element.fillVisible !== false };
    const backdrop = textElement ? element.background : fill.color;
    const tableElement = ['items', 'taxsummary'].includes(element.type);
    function drawBackground(height: number) {
      if (!backdrop || backdrop === 'transparent' || !(textElement ? element.backgroundVisible !== false : fill.visible)) return;
      let backdropHeight = height;
      if (textElement && textValue && template.kind === 'receipt' && element.resizeMode !== 'fixed') {
        const text = printElementValue(element, data), inset = element.border ? scale : 0, available = Math.max(1, w - padLeft - padRight - inset * 2) / squeeze;
        const measure = (value: string, bold: boolean) => { setFont(font, bold); return wrap(value, available).length * font * (element.lineHeight || leading) };
        const [title, ...body] = text.split('\n');
        const textHeight = element.type === 'text' && element.heading ? measure(title, true) + (body.length ? measure(body.join('\n'), element.bold) : 0) : measure(text, element.bold);
        backdropHeight = Math.max(h, textHeight + padTop + padBottom + inset * 2);
      }
      ensureCanvasHeight(y + backdropHeight + 2 * scale);
      const alpha = ctx.globalAlpha; ctx.globalAlpha *= textElement ? element.backgroundOpacity ?? 1 : fill.opacity; ctx.fillStyle = backdrop; ctx.beginPath(); ctx.roundRect(x, y, w, backdropHeight, radii); ctx.fill(); ctx.fillStyle = element.color || 'black'; ctx.globalAlpha = alpha;
    }
    if (!tableElement && !['shape', 'line'].includes(element.type)) drawBackground(h);
    const outer = { x, y, width: w, height: h };
    if (paddedContent) {
      x += padLeft; y += padTop; w -= padLeft + padRight; h -= padTop + padBottom;
      const growingContent = template.kind === 'receipt' && (['items', 'taxsummary'].includes(element.type) || textElement && element.resizeMode !== 'fixed');
      if (w <= 0 || h <= 0 && !growingContent) throw new Error('Padding leaves no room for content. Reduce padding or increase the layer size.');
      h = Math.max(0, h); used = h;
    }
    // Lay out growing tables before painting their background, then replay their ink.
    const tableCommands: (() => void)[] = [];
    const tableText = (...args: Parameters<typeof drawText>) => {
      const [text, , y, width, font, bold] = args;
      setFont(font, bold);
      const height = wrap(text, width / squeeze).length * font * (element.lineHeight || leading);
      ensureCanvasHeight(y + height + 2 * scale);
      tableCommands.push(() => { drawText(...args); });
      return height;
    };
    const tableRect = (x: number, y: number, width: number, height: number) => tableCommands.push(() => { ctx.fillRect(x, y, width, height); });
    if (element.type === 'frame') {
      used = Math.max(h, await drawElements(template.elements.filter(child => child.parentId === element.id), { x, y, width: w, height: h }) - y);
    } else if (element.type === 'shape') {
      const alpha = ctx.globalAlpha; ctx.globalAlpha *= fill.visible ? fill.opacity : 0;
      ctx.fillStyle = fill.color && fill.color !== 'transparent' ? fill.color : 'transparent';
      ctx.beginPath(); if (element.shape === 'ellipse') ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI*2); else ctx.roundRect(x, y, w, h, radii); ctx.fill(); ctx.globalAlpha = alpha;
    } else if (element.type === 'text' || element.type === 'field') {
      const text = printElementValue(element, data);
      if (text) {
        const inset = element.border ? scale : 0;
        setFont(font, element.bold);
        const contentHeight = wrap(text, Math.max(1, w - inset * 2) / squeeze).length * font * (element.lineHeight || leading);
        const offset = verticalTextOffset(h - inset * 2, contentHeight, element.textVerticalAlign);
        let height: number;
        if (element.type === 'text' && element.heading) {
          const [title, ...body] = text.split('\n');
          const titleHeight = drawText(title, x + inset, y + inset + offset, w - inset * 2, font, true, element.align, element.inverse);
          height = titleHeight + (body.length ? drawText(body.join('\n'), x + inset, y + inset + offset + titleHeight, w - inset * 2, font, element.bold, element.align, element.inverse) : 0) + inset * 2;
        } else height = drawText(text, x + inset, y + inset + offset, w - inset * 2, font, element.bold, element.align, element.inverse, elementIsStruck(element, data)) + inset * 2;
        if ((template.kind === 'label' || element.resizeMode === 'fixed') && !autoText && height > h + 1) throw new Error('Text exceeds its box. Increase the height, use auto height or reduce the font size.');
        used = autoText ? Math.max(h, height) : element.resizeMode === 'fixed' ? h : Math.max(h, height);
      }
    } else if (element.type === 'line') {
      const alpha = ctx.globalAlpha; ctx.globalAlpha *= fill.visible ? fill.opacity : 0; ctx.fillStyle = fill.color || 'transparent';
      ctx.fillRect(x, y + h / 2, w, Math.max(1, scale / 5));
      if (element.doubleLine) ctx.fillRect(x, y + h / 2 + scale * 0.5, w, Math.max(1, scale / 5));
      ctx.globalAlpha = alpha;
    } else if (element.type === 'barcode') {
      barcode(printElementValue(element, data), x, y, w, h, element);
    } else if (element.type === 'qrcode') {
      const value = printElementValue(element, data);
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
    } else if (element.type === 'logo' && (element.image || element.field)) {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Cannot load logo')); image.crossOrigin = 'anonymous'; image.src = element.image || quoteDocumentImage(fieldValue(data, element.field)); if (!image.src) reject(new Error('No image available for the selected data field')); });
      const ratio = (element.imageFit === 'cover' ? Math.max : Math.min)(w / image.width, h / image.height);
      ctx.save(); ctx.beginPath(); ctx.roundRect(outer.x, outer.y, outer.width, outer.height, radii); ctx.clip(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.drawImage(image, x + (w - image.width * ratio) / 2, y, image.width * ratio, image.height * ratio);
      ctx.restore();
    } else if (element.type === 'taxsummary' && !element.taxColumns) {
      const taxRows = receiptSummary(data).tax;
      if (!taxRows.length) continue;
      let rowY = y;
      const rule = (double = false) => { tableRect(x, rowY, w, Math.max(1, scale / 6)); if (double) tableRect(x, rowY + scale * 0.5, w, Math.max(1, scale / 6)); rowY += scale * 2; };
      rule(true);
      rowY += tableText('TAX SUMMARY', x, rowY, w, font, false, 'center', true) + scale;
      const row = (values: string[]) => {
        const fractions = [0, 0.13, 0.43, 0.73];
        rowY += Math.max(...values.map((value, i) => tableText(value, x + w * fractions[i], rowY, w * (i === 0 ? 0.13 : 0.27), font, false, 'left'))) + scale * 0.3;
      };
      row(['TAX', 'SGST', 'CGST', 'TOTAL']); rule();
      for (const tax of taxRows) row([`${tax.rate}%`, tax.sgst.toFixed(2), tax.cgst.toFixed(2), tax.total.toFixed(2)]);
      rule(true); used = Math.max(h, rowY - y);
    } else if ((element.type === 'items' && element.columns) || (element.type === 'taxsummary' && element.taxColumns)) {
      const columns = (element.type === 'taxsummary' ? element.taxColumns : element.columns)!;
      const rows = element.type === 'taxsummary' ? receiptSummary(data).tax : data.entries || [];
      const lines = tableColumnLines(columns);
      const style = element.tableStyle;
      const padding = (style?.cellPadding ?? element.tablePadding ?? 0.5) * scale;
      let rowY = y;
      const rule = () => {
        if (element.tableDashedRules) {
          for (let offset = 0; offset < w; offset += scale * 1.5) tableRect(x + offset, rowY + scale * 0.5, Math.min(scale, w - offset), Math.max(1, scale / 6));
        } else tableRect(x, rowY + scale * 0.5, w, Math.max(1, scale / 6));
        rowY += scale * 2;
      };
      const drawRow = (columns: NonNullable<PrintElement['columns']>, values: string[], header: boolean) => {
        const rowFont = (header ? style?.headerFontSize ?? style?.fontSize : style?.fontSize) === undefined ? font : (header ? style?.headerFontSize ?? style?.fontSize : style?.fontSize)! * Number(template.dpi) / 72;
        const total = columns.reduce((sum, column) => sum + column.width, 0);
        const widths = columns.map(column => w * column.width / total);
        if (widths.some(width => width <= padding * 2 + rowFont * 0.6 * squeeze)) throw new Error('A table column is too narrow. Increase its width, reduce padding or reduce text size.');
        const bold = header ? element.tableHeaderBold !== false : element.bold;
        setFont(rowFont, bold);
        const textHeights = values.map((value, i) => wrap(value, (widths[i] - padding * 2) / squeeze).length * rowFont * leading);
        const rowHeight = Math.max((header ? style?.headerHeight ?? 0 : style?.rowHeight ?? 0) * scale, Math.max(...textHeights) + padding * 2);
        ensureCanvasHeight(rowY + rowHeight + 2 * scale);
        if (rowY + rowHeight > 15000) throw new Error('Receipt is too long to render. Reduce the number of items.');
        let columnX = x;
        values.forEach((value, i) => {
          const extra = rowHeight - textHeights[i] - padding * 2;
          const offset = style?.verticalAlign === 'middle' ? extra / 2 : style?.verticalAlign === 'bottom' ? extra : 0;
          tableText(value, columnX + padding, rowY + padding + offset, widths[i] - padding * 2, rowFont, bold, columns[i].align);
          if (element.tableBorders !== false) { const cellX = columnX, cellY = rowY, cellWidth = widths[i]; tableCommands.push(() => { ctx.lineWidth = style?.borderWidth ? style.borderWidth * scale : Math.max(1, scale / 6); ctx.strokeRect(cellX, cellY, cellWidth, rowHeight); }); }
          columnX += widths[i];
        });
        rowY += rowHeight;
        pageBreaks.push(rowY);
      };
      lines.forEach(columns => drawRow(columns, columns.map(column => column.header), true));
      if (element.tableRules) rule();
      rows.forEach((entry: any, index: number) => {
        lines.forEach(columns => drawRow(columns, columns.map(column => {
          const value = tableCellValue(entry, column.field, index);
          return value + (value && column.suffix && !value.endsWith(column.suffix) && !(column.field === 'entry.discount' && Number(value) < 0) ? column.suffix : '');
        }), false));
        rowY += (element.tableItemGap ?? 0) * scale;
      });
      if (element.tableTotals) {
        rule();
        lines.filter(columns => columns.some(c => c.total)).forEach(columns => drawRow(columns, columns.map(column => tableColumnTotal(rows, column)), false));
      }
      if (element.tableRules || element.tableTotals) rule();
      used = Math.max(h, rowY - y);
    } else if (element.type === 'items') {
      let rowY = y;
      const descWidth = w * 0.57, qtyWidth = w * 0.12, amountWidth = w * 0.31;
      rowY += Math.max(tableText('Item / rate / tax', x, rowY, descWidth, font, true, 'left'), tableText('Qty', x + descWidth, rowY, qtyWidth, font, true, 'right'), tableText('Amount', x + descWidth + qtyWidth, rowY, amountWidth, font, true, 'right')) + scale;
      for (const item of data.entries || []) {
        const metadata = [item.size, item.unit, item.hsn ? `HSN ${item.hsn}` : '', item.tax ? `Tax ${item.tax}%` : '', `Rate ${Number(item.mrp || 0).toFixed(2)}`, item.discount ? `Disc ${item.discount}` : ''].filter(Boolean).join(' / ');
        const height = Math.max(tableText(`${item.description || item.name || ''}\n${metadata}`, x, rowY, descWidth, font, element.bold, 'left'), tableText(String(item.qty ?? 0), x + descWidth, rowY, qtyWidth, font, false, 'right'), tableText(Number(item.tvalue ?? item.value ?? 0).toFixed(2), x + descWidth + qtyWidth, rowY, amountWidth, font, false, 'right'));
        rowY += height + scale * 2;
        if (rowY > 15000) throw new Error('Receipt is too long to render. Reduce the number of items.');
      }
      used = Math.max(h, rowY - y);
    }
    if (paddedContent) used = Math.max(outer.height, used + padTop + padBottom);
    x = outer.x; y = outer.y; w = outer.width; h = outer.height;
    if (tableElement) { drawBackground(used); tableCommands.forEach(draw => draw()); }
    if (textElement && element.border) { ctx.save(); ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, scale / 5); ctx.beginPath(); ctx.roundRect(x, y, w, used, radii); ctx.stroke(); ctx.restore(); }
    if (element.borderWidth) {
      ctx.save(); ctx.strokeStyle = element.borderColor || '#000000'; ctx.lineWidth = Math.min(element.borderWidth * scale, w, used);
      const inset = ctx.lineWidth / 2, strokeWidth = w - inset * 2, strokeHeight = used - inset * 2;
      ctx.beginPath();
      if (element.type === 'shape' && element.shape === 'ellipse') ctx.ellipse(x + w / 2, y + used / 2, strokeWidth / 2, strokeHeight / 2, 0, 0, Math.PI * 2);
      else ctx.roundRect(x + inset, y + inset, strokeWidth, strokeHeight, radii.map(radius => Math.max(0, radius - inset)));
      ctx.stroke(); ctx.restore();
    }
    const matrix = ctx.getTransform();
    const corners = [[x,y],[x+w+Math.max(0,marginRight),y],[x,y+used+Math.max(0,marginBottom)],[x+w+Math.max(0,marginRight),y+used+Math.max(0,marginBottom)]].map(([x,y]) => matrix.transformPoint({x,y}));
    const visibleBottom = Math.max(...corners.map(point => point.y));
    ensureCanvasHeight(Math.max(y + used + Math.max(0, marginBottom), visibleBottom) + 2 * scale);
    localBottom = Math.max(localBottom, y + used + Math.max(0, marginBottom));
    if (template.kind === 'label' && corners.some(p => p.x < -.5 || p.y < -.5 || p.x > canvas.width + .5 || p.y > canvas.height + .5)) throw new Error('Place rotated layers inside the label dimensions.');
    bounds.push(layerBounds(element.id, x, y, w, used));
    if (template.kind === 'receipt') imageBottom = Math.max(imageBottom, visibleBottom);
    if (!parent && !floating && template.kind === 'receipt') { flowBottom = Math.max(flowBottom, y + used, visibleBottom); cursor = y + used + marginBottom; pageBreaks.push(cursor); }
    if (cursor > 15000) throw new Error('Receipt is too long to render. Reduce content or font sizes.');
    } finally { ctx.restore(); ctx.setTransform(previousTransform); ctx.globalAlpha = previousAlpha; activeElement = previous; }
  }
  return localBottom;
  }
  await drawElements(elements);
  if (template.kind === 'receipt') {
    cursor = Math.max(cursor, flowBottom);
    const invoiceLines = billDocumentLines(data);
    if (invoiceLines.length) {
      cursor += 2*scale;
      cursor += drawText(invoiceLines.join('\n'),2*scale,cursor,(template.width-4)*scale,10*Number(template.dpi)/72,true,'left')+scale;
      if (cursor>15000) throw new Error('Receipt is too long to render. Shorten the notes or terms.');
    }
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
    const bottom = Math.max(cursor, imageBottom);
    if (bottom > 15500) throw new Error('Receipt content exceeds the supported canvas length.');
    const cropped = document.createElement('canvas'); cropped.width = width; cropped.height = Math.max(Math.ceil(bottom + 2 * scale), template.paperSize ? Math.round(template.height * width / template.width) : 0);
    cropped.getContext('2d')!.drawImage(canvas, 0, 0);
    return finish(cropped, template, bounds, pageBreaks, options.mode, emptyBounds);
  }
  return finish(canvas, template, bounds, [], options.mode, emptyBounds);
}

function finish(canvas: HTMLCanvasElement, template: PrintTemplate, bounds: PrintLayerBounds[], pageBreaks: number[] = [], mode: 'design' | 'print' = 'print', emptyBounds: PrintLayerBounds[] = []) {
  const selection = emptyBounds.length ? { emptyBounds } : {};
  if (template.paperSize || mode === 'design') return { canvas, bounds, ...selection, width: template.width, height: template.kind === 'label' ? template.height : canvas.height * 25.4 / Number(template.dpi), paperHeight: template.paperSize ? template.height : undefined, pageBreaks };
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Thermal proof, PDF and printer output share the same monochrome pixels.
  for (let i = 0; !template.paperSize && i < pixels.data.length; i += 4) {
    const value = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3 < 128 ? 0 : 255;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return { canvas, bounds, ...selection, width: template.width, height: template.kind === 'label' ? template.height : canvas.height * 25.4 / Number(template.dpi), paperHeight: template.paperSize ? template.height : undefined, pageBreaks };
}

export function templatePrintBytes(rendered: Awaited<ReturnType<typeof renderPrintTemplate>>, template: PrintTemplate, language: 'tspl' | 'cpcl' = 'tspl') {
  if (template.paperSize) throw new Error('Sheet receipts use the system print dialog or PDF, not a thermal printer.');
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
    // TSPL remembers origin/shift from previous jobs. The canvas already contains its margins.
    // https://fs.tscprinters.com/system/files/31-0000001-00_tspl_tspl2_programming_3_0.pdf (REFERENCE / SHIFT)
    parts.push(encode(`SIZE ${template.width} mm,${template.height} mm\r\nGAP 2 mm,0 mm\r\nDIRECTION 1,0\r\nREFERENCE 0,0\r\nSHIFT 0,0\r\nCLS\r\nBITMAP 0,0,${stride},${canvas.height},0,`));
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
  if (!rendered.paperHeight && rendered.height > 1400) throw new Error('Receipt exceeds the PDF page limit. Print it directly or reduce content.');
  // The renderer is also imported during SSR; load the PDF library only for a browser download.
  const { jsPDF } = await import('jspdf');
  const height = rendered.paperHeight || rendered.height;
  const pdf = new jsPDF({ unit: 'mm', format: [rendered.width, height], orientation: rendered.width > height ? 'landscape' : 'portrait' });
  renderedTemplatePages(rendered).forEach((page, index) => {
    if (index) pdf.addPage([rendered.width, height], rendered.width > height ? 'landscape' : 'portrait');
    pdf.addImage(page.canvas.toDataURL('image/png'), 'PNG', 0, 0, rendered.width, page.height);
  });
  return pdf;
}

export async function createTemplatePDF(template: PrintTemplate, data: any) {
  return renderedTemplatePDF(await renderPrintTemplate(template, data));
}

/** Slice sheet receipts at row/section boundaries, preserving the canvas pixels. */
export function renderedTemplatePages(rendered: Awaited<ReturnType<typeof renderPrintTemplate>>) {
  if (!rendered.paperHeight) return [{ canvas: rendered.canvas, height: rendered.height }];
  const scale = rendered.canvas.width / rendered.width, limit = Math.round(rendered.paperHeight * scale);
  const pages: { canvas: HTMLCanvasElement; height: number }[] = [];
  let start = 0;
  while (start < rendered.canvas.height) {
    const edge = Math.min(start + limit, rendered.canvas.height);
    const safe = rendered.pageBreaks.filter(y => y > start + limit * 0.6 && y <= edge).sort((a, b) => a - b).at(-1);
    const end = edge < rendered.canvas.height && safe ? Math.floor(safe) : edge;
    const canvas = document.createElement('canvas'); canvas.width = rendered.canvas.width; canvas.height = end - start;
    canvas.getContext('2d')!.drawImage(rendered.canvas, 0, start, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    pages.push({ canvas, height: canvas.height / scale }); start = end;
  }
  return pages;
}

export async function printSheetReceipt(template: PrintTemplate, data: any) {
  const rendered = await renderPrintTemplate(template, data), pages = renderedTemplatePages(rendered);
  const frame = document.createElement('iframe'); frame.title = 'Print receipt'; frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;';
  const ready = new Promise<void>(resolve => { frame.onload = () => resolve(); });
  frame.srcdoc = `<!doctype html><html><head><style>@page{size:${template.width}mm ${template.height}mm;margin:0}body{margin:0}.page{width:${template.width}mm;height:${template.height}mm;break-after:page}.page:last-child{break-after:auto}img{display:block;width:100%}</style></head><body>${pages.map(page => `<div class="page"><img src="${page.canvas.toDataURL('image/png')}" alt="Receipt page"></div>`).join('')}</body></html>`;
  document.body.appendChild(frame);
  try {
    await ready; await Promise.all(Array.from(frame.contentDocument!.images).map(image => image.decode()));
    frame.contentWindow!.focus(); frame.contentWindow!.print();
  } catch (error) { frame.remove(); throw error; }
  frame.contentWindow!.addEventListener('afterprint', () => frame.remove(), { once: true });
  setTimeout(() => frame.remove(), 300000);
  return { success: true };
}

export async function downloadTemplatePDF(template: PrintTemplate, data: any, filename = 'receipt.pdf') {
  const pdf = await createTemplatePDF(template, data);
  pdf.save(filename);
}

