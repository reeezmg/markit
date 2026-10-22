// Reference-photo content. The QR uses a sample address, never a real payment destination.
export const receiptPhotoFixture = {
  companyName: 'City Center', companyAddress: { street: 'CITY CENTRE', city: 'Uppinangady', state: 'Karnataka', pincode: '574241' },
  gstin: '29ACBPH0045H1ZO', invoiceNumber: '14301', date: '2026-10-07T11:29:00Z', paymentMethod: 'UPI', isTaxIncluded: true,
  entries: [
    { description: 'FOOTWEAR', hsn: '64039990', qty: 1, mrp: 250, value: 250, discount: 0, tax: 5, tvalue: 250 },
    { description: 'LADIES PANT', hsn: '6101', qty: 1, mrp: 290, value: 290, discount: 0, tax: 12, tvalue: 290 },
  ],
  subtotal: 540, tqty: 2, tvalue: 540, ttvalue: 540, grandTotal: 540, tdiscount: 0, discount: 0,
  upiId: 'preview@upi', thankYouNote: 'Thank you please visit us again', phone: '+91 9945923901',
};
