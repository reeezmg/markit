export interface LabelVariable { key: string; label: string; group: string; sample: string | number; format?: 'money' | 'date' }
const fields = (group: string, prefix: string, definitions: [string, string, string | number, ('money' | 'date')?][]): LabelVariable[] =>
  definitions.map(([key, label, sample, format]) => ({ key: `${prefix}.${key}`, label, group, sample, format }));
const address = (group: string, prefix: string) => fields(group, prefix, [
  ['name', 'Address name', 'Main store'], ['phoneNo', 'Contact phone', '9876543210'],
  ['street', 'Street', 'Main Road'], ['locality', 'Locality', 'Town centre'], ['landmark', 'Landmark', 'Near market'],
  ['city', 'City', 'Kochi'], ['state', 'State', 'Kerala'], ['pincode', 'Postal code', '682001'],
  ['houseDetails', 'Building / house', '12A'], ['formattedAddress', 'Formatted address', '12A, Main Road, Kochi'],
]);
export const labelVariables: LabelVariable[] = [
  ...fields('Company', 'company', [
    ['name', 'Company name', 'Sample Store'], ['storecode', 'Store code', 101], ['storeUniqueName', 'Store username', 'sample-store'],
    ['phone', 'Phone', '9876543210'], ['email', 'Email', 'store@example.com'], ['gstin', 'GST number', '32ABCDE1234F1Z5'],
    ['description', 'Description', 'Clothing and accessories'], ['currency', 'Currency', 'INR'],
    ['thankYouNote', 'Thank-you note', 'Thank you!'], ['returnPolicy', 'Return policy', 'Returns within 7 days'],
    ['refundPolicy', 'Refund policy', 'Refunds as per store policy'], ['instagramUrl', 'Instagram', 'https://instagram.com/sample'],
    ['facebookUrl', 'Facebook', 'https://facebook.com/sample'], ['openTime', 'Opening time', '09:30'], ['closeTime', 'Closing time', '21:00'],
  ]),
  ...address('Company address', 'company.address'),
  ...fields('Product', 'product', [
    ['name', 'Product name', 'Cotton shirt'], ['description', 'Description', 'Pure cotton'], ['rating', 'Rating', 4.5],
    ['weight', 'Weight (kg)', 0.3], ['length', 'Length (cm)', 30], ['width', 'Width (cm)', 20], ['height', 'Height (cm)', 2],
    ['createdAt', 'Created date', '2026-10-07', 'date'],
  ]),
  ...['category', 'subcategory'].flatMap(relation => fields(relation === 'category' ? 'Product category' : 'Product subcategory', `product.${relation}`, [
    ['name', 'Name', relation === 'category' ? 'Clothing' : 'Shirts'], ['description', 'Description', 'Everyday essentials'],
    ['hsn', 'HSN code', '6109'], ['fixedTax', 'Fixed tax (%)', 5], ['taxType', 'Tax type', 'FIXED'],
    ['thresholdAmount', 'Tax threshold', 1000, 'money'], ['taxBelowThreshold', 'Tax below threshold (%)', 5], ['taxAboveThreshold', 'Tax above threshold (%)', 12],
  ])),
  ...['brand', 'collection'].flatMap(relation => fields(`Product ${relation}`, `product.${relation}`, [
    ['name', 'Name', relation === 'brand' ? 'Sample Brand' : 'Summer'], ['description', 'Description', 'Everyday wear'], ['targetAudience', 'Target audience', 'Adults'],
  ])),
  ...fields('Variant', 'variant', [
    ['name', 'Variant name', 'Blue'], ['code', 'Code / SKU', 'SHIRT-BLU'], ['unit', 'Unit', 'Nos'], ['sizeLabel', 'Size label (Size, Shade, etc.)', 'Size'],
    ['sprice', 'Selling price / MRP', 1440, 'money'], ['dprice', 'Discounted price', 1299, 'money'], ['pprice', 'Purchase price', 900, 'money'],
    ['discount', 'Discount', 10], ['tax', 'Tax', 5], ['weight', 'Weight (kg)', 0.3], ['length', 'Length (cm)', 30], ['width', 'Width (cm)', 20], ['height', 'Height (cm)', 2],
  ]),
  ...fields('Variant brand', 'variant.brand', [['name', 'Brand name', 'Sample Brand'], ['description', 'Description', 'Everyday wear'], ['targetAudience', 'Target audience', 'Adults']]),
  ...fields('Item / size', 'item', [
    ['barcode', 'Barcode', '313063057461'], ['size', 'Size / shade value', 'M'], ['qty', 'Stock quantity', 12], ['initialQty', 'Initial quantity', 20], ['soldQty', 'Sold quantity', 8],
    ['weight', 'Weight (kg)', 0.3], ['length', 'Length (cm)', 30], ['width', 'Width (cm)', 20], ['height', 'Height (cm)', 2], ['createdAt', 'Created date', '2026-10-07', 'date'],
  ]),
  ...fields('Distributor', 'distributor', [['name', 'Distributor name', 'Sample Supplier'], ['gstin', 'GST number', '32ABCDE1234F1Z5']]),
  ...address('Distributor address', 'distributor.address'),
  ...fields('Distributor account', 'distributorCompany', [['distributorNumber', 'Company distributor number', 12]]),
  ...fields('Purchase order', 'purchaseorder', [
    ['purchaseOrderNo', 'Purchase order number', 101], ['billNo', 'Supplier bill number', 'SUP-101'], ['createdAt', 'Purchase date', '2026-10-07', 'date'], ['paymentType', 'Payment type', 'CREDIT'],
  ]),
];
export function customLabelVariables(definitions: { scope: string; key: string; label: string; type?: string }[]): LabelVariable[] {
  return definitions.filter(d => ['PRODUCT', 'VARIANT'].includes(d.scope) && /^[a-zA-Z0-9_-]+$/.test(d.key)).map(d => ({
    key: `${d.scope.toLowerCase()}.customFields.${d.key}`, label: d.label,
    group: d.scope === 'PRODUCT' ? 'Product custom fields' : 'Variant custom fields', sample: d.type === 'NUMBER' ? 10 : 'Sample',
  }));
}
export function nestedLabelValue(data: any, field: string): unknown {
  const parts = field.split('.');
  if (parts.some(p => ['__proto__', 'prototype', 'constructor'].includes(p))) return undefined;
  return parts.reduce((value, key) => value != null && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined, data);
}
export function labelSampleData(flat: any, custom: LabelVariable[] = []) {
  const data: any = JSON.parse(JSON.stringify(flat || {}));
  data.labelVariablesLoaded = true;
  for (const variable of [...labelVariables, ...custom]) {
    const parts = variable.key.split('.');
    let target = data;
    for (const part of parts.slice(0, -1)) target = target[part] ||= {};
    target[parts.at(-1)!] = variable.sample;
  }
  data.company.name = flat.shopname || data.company.name;
  data.product.name = flat.productName || data.product.name;
  for (const key of ['name', 'code', 'sprice', 'dprice', 'sizeLabel']) if (flat[key] != null) data.variant[key] = flat[key];
  for (const key of ['barcode', 'size']) if (flat[key] != null) data.item[key] = flat[key];
  return data;
}
