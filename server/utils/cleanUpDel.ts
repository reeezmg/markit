import { prisma } from '~/server/prisma';

type BillCleanupOptions = {
  companyId: string;
  startDate: Date;
  deleteBillIds: string[];
  leastInvoice: number; // plain number now
};

export async function applyBillDeletionCleanup(opts: BillCleanupOptions) {
  const { companyId, startDate, deleteBillIds, leastInvoice } = opts;

  return await prisma.$transaction(async (tx) => {
    // Step 1: Hard delete selected bills
    const deleteResult = await tx.bill.deleteMany({
      where: {
        id: { in: deleteBillIds },
        companyId,
      },
    });

    // Step 2: Get bills that remain and need renumbering (from startDate)
    const billsToRenumber = await tx.bill.findMany({
      where: {
        companyId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        invoiceNumber: true, // already a number
      },
    });

    // Step 3: Renumber sequentially
    let currentNumber = leastInvoice || 0;
    

    for (const bill of billsToRenumber) {
      const num = bill.invoiceNumber ?? 0;

      // Skip if current bill number is already less than the least
      if (num < leastInvoice) {
        currentNumber = Math.max(currentNumber, num + 1);
        continue;
      }

      // Update invoice number (as int)
      await prisma.bill.update({
        where: { id: bill.id },
        data: { invoiceNumber: currentNumber },
      });

      currentNumber++;
    }

    return {
      totalDeleted: deleteResult.count,
      deletedBillIds: deleteBillIds,
      invoiceFixed: true,
      lastInvoice: currentNumber - 1,
    };
  }, {
    maxWait: 1000000000,
    timeout: 1000000000,
  });
}
