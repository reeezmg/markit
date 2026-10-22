import { labelBarcode } from './label-barcode';
import type { PrintTemplate } from './print-templates';
import { labelVariables } from './label-variables';

const relatedRoots = new Set(labelVariables.map(v => v.key.split('.')[0]));
export async function loadLabelVariables(items: any[], template: PrintTemplate) {
  const related = template.elements.some(e => e.field.includes('.') && relatedRoots.has(e.field.split('.')[0]));
  const usesItemBarcode = template.elements.some(e => e.type === 'barcode' && ['barcode', 'item.barcode'].includes(e.field));
  const pending = items.filter(item => (related && !item.labelVariablesLoaded) || (usesItemBarcode && !labelBarcode(item) && item.itemId));
  if (!pending.length) return items;
  if (!navigator.onLine) throw new Error('Connect to the internet to load label variables for these products.');
  const fallbackCompany = useNuxtApp().$auth.session.value?.companyId;
  const companies = [...new Set(pending.map(item => item.companyId || fallbackCompany))];
  const enriched = new Map<any, any>();
  for (const companyId of companies) {
    if (!companyId) throw new Error('Select a company before loading label variables.');
    const group = pending.filter(item => (item.companyId || fallbackCompany) === companyId);
    const identities = [...new Set(group.map(item => item.itemId ? `id:${item.itemId}` : item.barcode ? `barcode:${item.barcode}` : ''))];
    if (identities.includes('')) throw new Error('Save this product before printing labels with related variables.');
    const records: any[] = [];
    for (let offset = 0; offset < identities.length; offset += 500) {
      const batch = identities.slice(offset, offset + 500);
      const rows = await $fetch<any[]>('/api/settings/label-variables', { method: 'POST', headers: { 'x-company-id': companyId }, body: {
        itemIds: batch.filter(key => key.startsWith('id:')).map(key => key.slice(3)),
        barcodes: batch.filter(key => key.startsWith('barcode:')).map(key => key.slice(8)),
      } });
      records.push(...rows);
    }
    const byId = new Map(records.map(row => [row.itemId, row]));
    const byBarcode = new Map<string, any[]>();
    for (const row of byId.values()) {
      const matches = byBarcode.get(row.barcode) || [];
      matches.push(row); byBarcode.set(row.barcode, matches);
    }
    for (const item of group) {
      const matches = item.itemId ? (byId.has(item.itemId) ? [byId.get(item.itemId)] : []) : byBarcode.get(item.barcode) || [];
      if (matches.length !== 1) throw new Error('Could not identify a unique product for this label. Reload the product and try again.');
      const record = matches[0];
      enriched.set(item, { ...item, ...record.variables, barcode: labelBarcode(item) || labelBarcode(record.variables) || labelBarcode(record), companyId, labelVariablesLoaded: true });
    }
  }
  return items.map(item => enriched.get(item) || item);
}
