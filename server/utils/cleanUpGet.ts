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

  console.log(bills, 'bills found for cleanup:', bills.length);

  const allTotal = bills.reduce((sum, b) => sum + (b.grandTotal ?? 0), 0);
  const allCount = bills.length;

  // track least invoice number (just numeric now)
  let leastInvoice: number | null = null;
  const preview: any[] = [];

  let deletedTotal = 0;

  for (const bill of bills) {
    // if (!bill.invoiceNumber) continue;

    const billTotal = bill.grandTotal ?? 0;
    const num = bill.invoiceNumber ?? 0;

    // Always track least invoice number
    if (leastInvoice === null || num < leastInvoice) {
      leastInvoice = num;
    }

    // IGNORE: if paymentMethod doesn't match
    if (paymentMethod && bill.paymentMethod !== paymentMethod) {
      preview.push({
        action: 'ignore',
        invoiceNumber: bill.invoiceNumber ,
        billId: bill.id,
        paymentMethod: bill.paymentMethod,
        billTotal,
      });
      continue;
    }

    const remainingAfterDelete = allTotal - deletedTotal - billTotal;

    // DELETE only if:
    // 1. bill >= minBillAmount
    // 2. remaining total won't drop below target
    if (
      billTotal >= minBillAmount &&
      remainingAfterDelete >= targetAmount
    ) {
      deletedTotal += billTotal;
      preview.push({
        action: 'delete',
        invoiceNumber: bill.invoiceNumber ,
        billId: bill.id,
        paymentMethod: bill.paymentMethod,
        billTotal,
      });
    } else {
      preview.push({
        action: 'keep',
        invoiceNumber: bill.invoiceNumber ,
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
    leastInvoice, // now a single number instead of per-prefix
    preview,
  };
}
