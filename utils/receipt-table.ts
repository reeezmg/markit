import { labelVariables, type LabelVariable } from './label-variables';
import { fieldValue, type PrintTemplate, type TableColumn } from './print-templates';
export const receiptTableVariables: LabelVariable[] = [
  ...[['description', 'Description'], ['qty', 'Quantity'], ['mrp', 'Billed rate'], ['value', 'Value before discount'], ['discount', 'Line discount'], ['discountAmount', 'Discount amount'], ['tax', 'Tax (%)'], ['tvalue', 'Line amount'], ['size', 'Size'], ['unit', 'Unit'], ['barcode', 'Barcode'], ['hsn', 'HSN']].map(([key, label]) => ({ key: `entry.${key}`, label, group: 'Bill item', sample: '' })),
  { key: 'rowNumber', label: 'Row number', group: 'Bill item', sample: 1 },
  ...labelVariables.filter(v => /^(product|variant|item)\./.test(v.key)),
];
export function receiptTableFields(template: PrintTemplate) {
  return [...new Set(template.elements.flatMap(e => e.type === 'items' ? (e.columns || []).map(c => c.field).filter(key => /^(product|variant|item)\./.test(key)) : []))];
}
export function tableCellValue(entry: any, key: string, index: number) {
  if (entry.receiptTableValues && Object.prototype.hasOwnProperty.call(entry.receiptTableValues, key)) return String(entry.receiptTableValues[key] ?? '');
  if (key === 'entry.discountAmount') return lineDiscountAmount(entry).toFixed(2);
  if (key === 'rowNumber') return String(index + 1);
  if (key.startsWith('entry.')) {
    const field = key.slice(6);
    const value = entry[field];
    if (value == null) return '';
    if (['mrp', 'value', 'tvalue'].includes(field)) return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '';
    return typeof value === 'object' ? '' : String(value);
  }
  return fieldValue(entry, key);
}
export function tableColumnLines(columns: TableColumn[]) {
  return [...new Set(columns.map(c => c.line || 1))].sort((a, b) => a - b).map(line => columns.filter(c => (c.line || 1) === line));
}
export function tableColumnTotal(entries: any[], column: TableColumn) {
  if (column.totalLabel) return column.totalLabel;
  if (!column.total || !/^entry\.(qty|mrp|value|discount|discountAmount|tvalue)$/.test(column.field)) return '';
  const field = column.field.slice(6);
  const number = (value: any) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const sum = entries.reduce((sum, entry) => {
    if (field === 'discountAmount') return sum + lineDiscountAmount(entry);
    if (field !== 'discount') return sum + number(entry[field]);
    const raw = String(entry.discount ?? '0');
    const discount = number(raw.replace('%', ''));
    return sum + (discount < 0 ? -discount * number(entry.qty) : number(entry.mrp) * number(entry.qty) * discount / 100);
  }, 0);
  return field === 'qty' ? String(sum) : sum.toFixed(2);
}

function lineDiscountAmount(entry: any) {
  const number = (value: any) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const discount = number(String(entry.discount ?? 0).replace('%', ''));
  return discount < 0 ? -discount * number(entry.qty) : number(entry.mrp) * number(entry.qty) * discount / 100;
}
