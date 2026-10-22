import type { PrintTemplate } from './print-templates';
import { receiptTableFields } from './receipt-table';
import { loadLabelVariables } from './load-label-variables.client';
export async function loadReceiptTable(data: any, template: PrintTemplate) {
  const fields = receiptTableFields(template);
  if (!fields.length) return data;
  const entries = (data.entries || []).map((entry: any) => ({ ...entry, companyId: data.companyId || entry.companyId }));
  const linked = entries.filter((entry: any) => entry.itemId || entry.barcode || entry.labelVariablesLoaded);
  const lookup = { ...template, elements: fields.map(field => ({ ...template.elements[0], field })) };
  const enriched = await loadLabelVariables(linked, lookup);
  let index = 0;
  return { ...data, entries: entries.map((entry: any) => entry.itemId || entry.barcode || entry.labelVariablesLoaded ? enriched[index++] : entry) };
}
