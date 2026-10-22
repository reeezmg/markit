// Shared physical layout for the built-in receipt's HTML, PDF and printer raster.
export type ReceiptMark = { kind: 'text' | 'line' | 'box'; x: number; y: number; width: number; height: number; text?: string; font?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; dashed?: boolean };
const number = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const money = (v: unknown) => number(v).toFixed(2);
export function noTaxReceiptLayout(data: any) {
  const marks: ReceiptMark[] = [];
  const width = 90, left = 3, inner = 84;
  let y = 4;
  function text(value: unknown, align: 'left' | 'center' | 'right' = 'left', font = 2.6, bold = false, gap = 0.7) {
    if (value === null || value === undefined || value === '') return;
    const string = String(value);
    const max = Math.floor(inner / (font * 0.61));
    const lines = string.split('\n').flatMap(line => line.match(new RegExp(`.{1,${max}}`, 'gu')) || ['']);
    for (const line of lines) {
      marks.push({ kind: 'text', x: left, y, width: inner, height: font * 1.3, text: line, font, bold, align });
      y += font * 1.3;
    }
    y += gap;
  }
  function rule() { y += 0.8; marks.push({ kind: 'line', x: left, y, width: inner, height: 0, dashed: true }); y += 2; }
  const columns = [5, 29, 8, 14, 13, 15];
  function row(values: unknown[], bold = false) {
    let x = left;
    values.forEach((value, i) => {
      const raw = String(value ?? '');
      const font = i === 1 ? 2.5 : Math.min(2.5, (columns[i] - 0.8) / (Math.max(1, raw.length) * 0.61));
      const max = Math.floor((columns[i] - 0.8) / (font * 0.6));
      const display = i === 1 && raw.length > max ? raw.slice(0, Math.max(1, max - 1)) + '…' : raw;
      marks.push({ kind: 'text', x, y, width: columns[i] - 0.6, height: 3.5, text: display, font, bold, align: i > 1 ? 'right' : 'left' });
      x += columns[i];
    });
    y += 4;
  }
  text(data.companyName, 'center', 3.2, true);
  const address = data.companyAddress;
  if (typeof address === 'string') text(address, 'center');
  else if (address) {
    for (const parts of [[address.name, address.street], [address.locality, address.city], [address.state, address.pincode]]) text(parts.filter(Boolean).join(', '), 'center');
  }
  if (data.gstin) text(`GSTIN: ${data.gstin}`, 'center');
  rule();
  text(`Invoice: ${data.invoiceNumber ?? ''}`);
  const date = new Date(data.date);
  text(`Date: ${Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  text(`Payment: ${data.paymentMethod ?? ''}`);
  if (data.clientName) text(`Client: ${data.clientName}`);
  if (data.clientPhone) text(`Phone: ${data.clientPhone}`);
  rule(); row(['SL', 'DESCRIPTION', 'QTY', 'MRP', 'DISC', 'VALUE'], true);
  const entries = Array.isArray(data.entries) ? data.entries : [];
  entries.forEach((item: any, index: number) => {
    row([index + 1, item.description || item.name, item.qty, money(item.mrp), String(item.discount ?? '').includes('%') ? item.discount : money(item.discount), money(item.tvalue ?? item.value)]);
    if (item.size) text(`Size: ${item.size}`, 'left', 2.3);
    y += 2;
  });
  rule();
  row(['', 'TOTAL', data.tqty ?? entries.reduce((s: number, e: any) => s + number(e.qty), 0), money(data.tvalue), money(data.tdiscount), money(data.ttvalue ?? data.subtotal)], true);
  rule();
  const raw = String(data.discount ?? '0');
  const billDiscount = raw.startsWith('+') ? -Math.abs(number(raw)) : number(raw) < 0 ? Math.abs(number(raw)) : number(data.ttvalue ?? data.subtotal) * number(raw) / 100;
  text(`DISC / ROUND OFF (+/-): ${raw.startsWith('+') ? '+' + money(Math.abs(number(raw))) : number(raw) < 0 ? '-' + money(Math.abs(number(raw))) : money(billDiscount)}`, 'center');
  y += 1;
  text(`GRAND TOTAL: ${money(data.grandTotal)}`, 'center', 3.8, true, 2);
  if (number(data.couponValue)) text(`Coupon discount: ${money(data.couponValue)}`, 'center');
  if (number(data.redeemedPoints)) text(`Points redeemed: ${money(data.redeemedPoints)}`, 'center');
  if (number(data.availablePoints)) text(`Points available: ${number(data.availablePoints)}`, 'center');
  const savings = Math.max(0, number(data.tdiscount) + billDiscount + number(data.couponValue) + number(data.redeemedPoints));
  marks.push({ kind: 'box', x: left, y, width: inner, height: 6.5 });
  y += 1.2; text(`YOUR SAVING: ${money(savings)}`, 'center', 2.6, true, 3);
  for (const note of [data.thankYouNote, data.returnPolicy, data.refundPolicy, data.phone ? `Customer Care: ${data.phone}` : '']) text(note, 'center', 2.6, false, 4);
  const height = y + 2;
  marks.unshift({ kind: 'box', x: 0.8, y: 0.8, width: 88.4, height: height - 1.6, dashed: true });
  // 72 mm printable area fits a standard 80 mm thermal roll.
  const scale = 72 / width;
  return { width: 72, height: height * scale, marks: marks.map(mark => ({ ...mark, x: mark.x * scale, y: mark.y * scale, width: mark.width * scale, height: mark.height * scale, font: mark.font === undefined ? undefined : mark.font * scale })) };
}
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export function noTaxReceiptHtml(data: any) {
  const layout = noTaxReceiptLayout(data);
  const content = layout.marks.map(mark => {
    const base = `position:absolute;box-sizing:border-box;left:${mark.x}mm;top:${mark.y}mm;width:${mark.width}mm;height:${mark.height}mm;`;
    if (mark.kind === 'text') return `<div style="${base}font:${mark.bold ? 'bold ' : ''}${mark.font}mm/1.3 'Courier New',monospace;text-align:${mark.align};white-space:pre">${escapeHtml(mark.text)}</div>`;
    return `<div aria-hidden="true" style="${base}${mark.kind === 'line' ? 'border-top' : 'border'}:0.2mm ${mark.dashed ? 'dashed' : 'solid'} black"></div>`;
  }).join('');
  return `<article aria-label="No Tax Receipt" style="position:relative;width:${layout.width}mm;height:${layout.height}mm;background:white;color:black">${content}</article>`;
}
export function noTaxReceiptDocument(data: any) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Receipt ${escapeHtml(data.invoiceNumber)}</title><style>body{margin:0;padding:16px;background:#eee}article{margin:auto}@media print{body{padding:0;background:white}@page{margin:0;size:72mm auto}}</style></head><body>${noTaxReceiptHtml(data)}</body></html>`;
}
