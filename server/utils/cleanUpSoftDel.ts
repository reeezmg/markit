import { prisma } from '~/server/prisma';

type BillSoftDeleteOptions = {
  companyId: string;
  startDate: Date;
  deleteBillIds: string[];
  leastInvoice: number;
};

export async function applySoftBillDeletionCleanup(opts: BillSoftDeleteOptions) {
  const { companyId, startDate, deleteBillIds, leastInvoice } = opts;

  return await prisma.$transaction(async (tx) => {
    // Step 1: Soft-delete selected bills by setting precedence = true
    const updateResult = await tx.bill.updateMany({
      where: {
        id: { in: deleteBillIds },
        companyId,
      },
      data: { precedence: true },
    });

    // Step 2: Soft-delete all BillHistory records for those bills
    await tx.billHistory.updateMany({
      where: {
        billId: { in: deleteBillIds },
      },
      data: { precedence: true },
    });

    // Step 3: Get remaining (non-soft-deleted) bills for renumbering
    const billsToRenumber = await tx.bill.findMany({
      where: {
        companyId,
        createdAt: { gte: startDate },
        precedence: { not: true },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        invoiceNumber: true,
      },
    });

    // Step 4: Renumber sequentially from leastInvoice
    let currentNumber = leastInvoice || 0;

    for (const bill of billsToRenumber) {
      const num = bill.invoiceNumber ?? 0;

      if (num < leastInvoice) {
        currentNumber = Math.max(currentNumber, num + 1);
        continue;
      }

      await tx.bill.update({
        where: { id: bill.id },
        data: { invoiceNumber: currentNumber },
      });

      currentNumber++;
    }

    return {
      totalSoftDeleted: updateResult.count,
      softDeletedBillIds: deleteBillIds,
      invoiceFixed: true,
      lastInvoice: currentNumber - 1,
    };
  }, {
    maxWait: 1000000000,
    timeout: 1000000000,
  });
}
