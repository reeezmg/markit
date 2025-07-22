import { prisma } from '~/server/prisma';

type BillCleanupOptions = {
  companyId: string;
  startDate: Date;
  deleteBillIds: string[];
  leastInvoiceByPrefix: Record<string, number>;
};

function parseInvoice(inv: string) {
  const [prefix, num] = inv.split('/');
  return { prefix, num: parseInt(num) };
}

function buildInvoice(prefix: string, num: number) {
  return `${prefix}/${num}`;
}

export async function applyBillDeletionCleanup(opts: BillCleanupOptions) {
  const { companyId, startDate, deleteBillIds, leastInvoiceByPrefix } = opts;

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
        invoiceNumber: true,
      },
    });

    // Step 3: Prepare all updates at once
    const currentPrefixCounter: Record<string, number> = { ...leastInvoiceByPrefix };

for (const bill of billsToRenumber) {
    const { prefix, num } = parseInvoice(bill.invoiceNumber!);

    const least = currentPrefixCounter[prefix] ?? 1;

    // Skip if the current number is <= leastPrefix => no renumbering
    if (num < least) {
        // But still update the counter if needed
        currentPrefixCounter[prefix] = Math.max(currentPrefixCounter[prefix] ?? 1, num + 1);
        continue;
    }

    // Update invoice number with current counter
    const newInvoiceNumber = `${prefix}/${currentPrefixCounter[prefix]}`;
    await prisma.bill.update({
        where: { id: bill.id },
        data: { invoiceNumber: newInvoiceNumber },
    });

    // Increment for next use
    currentPrefixCounter[prefix]++;
}


    return {
      totalDeleted: deleteResult.count,
      deletedBillIds: deleteBillIds,
      invoiceFixed: true,
      lastInvoiceByPrefix: currentPrefixCounter,
    };
  }, {
    maxWait: 1000000000,
    timeout: 1000000000,
  });
}