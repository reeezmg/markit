export function printDesignerSamples(company: Record<string, any> = {}) {
  return {
    receipt: { companyId: company.companyId, isTaxIncluded: company.isTaxIncluded ?? true, companyName: company.companyName || 'Store', companyAddress: company.address || {},
      phone: company.companyPhone || '9999999999', gstin: company.gstin || '', upiId: company.upiId || '', invoiceNumber: 'TEST-001', date: new Date().toISOString(),
      clientName: 'Sample customer', clientPhone: '9999999999', paymentMethod: 'Cash', thankYouNote: 'Thank you for shopping!', returnPolicy: 'Exchange within 7 days', refundPolicy: 'Refunds as per store policy',
      entries: [{ description: 'Sample product', hsn: '6109', qty: 1, mrp: 99, discount: 0, tax: 5, value: 99, tvalue: 99 }], subtotal: 99, grandTotal: 99, discount: 0, tdiscount: 0, tqty: 1, tvalue: 99, ttvalue: 99 },
    label: { companyId: company.companyId, barcode: '313063057461', code: 'TEST-Printer', shopname: company.companyName || 'Store', productName: 'Sample product', brand: 'Sample brand', name: 'Blue', size: 'M', sprice: 1440, dprice: 1299 },
  }
}
