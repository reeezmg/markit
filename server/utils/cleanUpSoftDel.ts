import { Prisma } from '@prisma/client';
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

    // Step 3: Renumber remaining non-soft-deleted bills in one round-trip.
    const [renumberResult] = await tx.$queryRaw<
      { updated_count: number; last_invoice: number }[]
    >(Prisma.sql`
      WITH ordered AS (
        SELECT
          id,
          (${leastInvoice}::integer + ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) - 1)::integer AS new_invoice_number
        FROM bills
        WHERE company_id = ${companyId}
          AND created_at >= CAST(${startDate} AS timestamp)
          AND precedence IS NOT TRUE
          AND COALESCE(invoice_number, 0) >= ${leastInvoice}
      ),
      updated AS (
        UPDATE bills AS b
        SET
          invoice_number = ordered.new_invoice_number,
          updated_at = NOW()
        FROM ordered
        WHERE b.id = ordered.id
        RETURNING b.invoice_number
      )
      SELECT
        COUNT(*)::integer AS updated_count,
        COALESCE(MAX(invoice_number), ${leastInvoice - 1})::integer AS last_invoice
      FROM updated
    `);

    return {
      totalSoftDeleted: updateResult.count,
      softDeletedBillIds: deleteBillIds,
      invoiceFixed: true,
      lastInvoice: renumberResult?.last_invoice ?? leastInvoice - 1,
    };
  }, {
    maxWait: 1000000000,
    timeout: 1000000000,
  });
}
