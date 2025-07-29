import { prisma } from '~/server/prisma';

type BillPreviewOptions = {
  companyId: string;
  startDate: Date;
  endDate: Date;
  paymentMethod: string;
  targetAmount: number;
  minBillAmount: number;
  timePref: 'oldest' | 'newest';
  valuePref: 'lowest' | 'highest';
};

function parseInvoice(inv: string) {
  const [prefix, num] = inv.split('/');
  return {
    prefix: prefix,
    num: parseInt(num),
  };
}

export async function previewBillsForReduction(opts: BillPreviewOptions) {
  const {
    companyId,
    startDate,
    endDate,
    paymentMethod,
    targetAmount,
    minBillAmount,
    valuePref,
  } = opts;

  const [bills] = await prisma.$transaction(async (tx) => {
    const bills = await tx.bill.findMany({
      where: {
        companyId,
        deleted: false,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: [
        { grandTotal: valuePref === 'lowest' ? 'asc' : 'desc' },
      ],
    });
    return [bills];
  });

  const allTotal = bills.reduce((sum, b) => sum + (b.grandTotal ?? 0), 0);
  const allCount = bills.length;
  const deleteTarget = allTotal - targetAmount;

  const leastInvoiceByPrefix: Record<string, number> = {};
  const preview: any[] = [];

  let deletedTotal = 0;

  for (const bill of bills) {
    if (!bill.invoiceNumber) continue;

    const billTotal = bill.grandTotal ?? 0;

    // Always track least invoice number
    const { prefix, num } = parseInvoice(bill.invoiceNumber);
    if (!leastInvoiceByPrefix[prefix] || leastInvoiceByPrefix[prefix] > num) {
      leastInvoiceByPrefix[prefix] = num;
    }

    // IGNORE: if paymentMethod doesn't match
    if (paymentMethod && bill.paymentMethod !== paymentMethod) {
      preview.push({
        action: 'ignore',
        invoiceNumber: bill.invoiceNumber,
        billId: bill.id,
        paymentMethod: bill.paymentMethod,
        billTotal,
      });
      continue;
    }

    // DELETE if needed and bill is eligible (above minBillAmount)
    if (
      deletedTotal < deleteTarget &&
      billTotal >= minBillAmount
    ) {
      deletedTotal += billTotal;
      preview.push({
        action: 'delete',
        invoiceNumber: bill.invoiceNumber,
        billId: bill.id,
        paymentMethod: bill.paymentMethod,
        billTotal,
      });
    } else {
      preview.push({
        action: 'keep',
        invoiceNumber: bill.invoiceNumber,
        billId: bill.id,
        paymentMethod: bill.paymentMethod,
        billTotal,
      });
    }
  }

  return {
    billsCountBefore: allCount,
    billsValueBefore: allTotal,
    billsCountAfter: preview.filter(b => b.action !== 'delete').length,
    billsValueAfter: preview
      .filter(b => b.action !== 'delete')
      .reduce((sum, b) => sum + b.billTotal, 0),
    deleteBillIds: preview
      .filter(b => b.action === 'delete')
      .map(b => b.billId),
    leastInvoiceByPrefix,
    preview,
  };
}
