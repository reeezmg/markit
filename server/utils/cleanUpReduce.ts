import { Prisma } from '@prisma/client';
import { prisma } from '~/server/prisma';

type BillReduction = {
  billId: string;
  reducedTotal: number;
};

type BillReductionOptions = {
  companyId: string;
  reductions: BillReduction[];
};

export async function applyBillReductionCleanup(opts: BillReductionOptions) {
  const reductions = (opts.reductions || [])
    .map((row) => ({
      billId: String(row.billId || ''),
      reducedTotal: Math.max(0, Number(row.reducedTotal || 0)),
    }))
    .filter((row) => row.billId);

  if (!opts.companyId || !reductions.length) {
    return {
      totalReducedBills: 0,
      totalReducedAmount: 0,
      reducedBillIds: [],
    };
  }

  return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`ALTER TABLE bills ADD COLUMN IF NOT EXISTS original_subtotal DOUBLE PRECISION`);
    await tx.$executeRaw(Prisma.sql`ALTER TABLE bills ADD COLUMN IF NOT EXISTS original_grand_total DOUBLE PRECISION`);
    await tx.$executeRaw(Prisma.sql`ALTER TABLE bills ADD COLUMN IF NOT EXISTS original_discount DOUBLE PRECISION`);
    await tx.$executeRaw(Prisma.sql`ALTER TABLE entries ADD COLUMN IF NOT EXISTS original_rate DOUBLE PRECISION`);
    await tx.$executeRaw(Prisma.sql`ALTER TABLE entries ADD COLUMN IF NOT EXISTS original_value DOUBLE PRECISION`);
    await tx.$executeRaw(Prisma.sql`ALTER TABLE entries ADD COLUMN IF NOT EXISTS original_discount DOUBLE PRECISION`);

    const reductionsJson = JSON.stringify(reductions);

    await tx.$executeRaw(Prisma.sql`
      WITH reductions AS (
        SELECT *
        FROM jsonb_to_recordset(CAST(${reductionsJson} AS jsonb))
          AS r("billId" text, "reducedTotal" double precision)
      )
      UPDATE bills AS b
      SET
        original_subtotal = COALESCE(NULLIF(b.original_subtotal, 0), b.subtotal),
        original_grand_total = COALESCE(NULLIF(b.original_grand_total, 0), b.grand_total),
        original_discount = COALESCE(NULLIF(b.original_discount, 0), b.discount)
      FROM reductions r
      WHERE b.id = r."billId"
        AND b.company_id = ${opts.companyId}
    `);

    await tx.$executeRaw(Prisma.sql`
      WITH reductions AS (
        SELECT *
        FROM jsonb_to_recordset(CAST(${reductionsJson} AS jsonb))
          AS r("billId" text, "reducedTotal" double precision)
      )
      UPDATE entries AS e
      SET
        original_rate = COALESCE(NULLIF(e.original_rate, 0), e.rate),
        original_value = COALESCE(NULLIF(e.original_value, 0), e.value),
        original_discount = COALESCE(NULLIF(e.original_discount, 0), e.discount)
      FROM reductions r
      JOIN bills b ON b.id = r."billId"
      WHERE e.bill_id = b.id
        AND b.company_id = ${opts.companyId}
    `);

    const [result] = await tx.$queryRaw<
      { total_reduced_bills: number; total_reduced_amount: number }[]
    >(Prisma.sql`
      WITH reductions AS (
        SELECT *
        FROM jsonb_to_recordset(CAST(${reductionsJson} AS jsonb))
          AS r("billId" text, "reducedTotal" double precision)
      ),
      factors AS (
        SELECT
          b.id,
          b.grand_total AS old_total,
          GREATEST(r."reducedTotal", 0) AS new_total,
          CASE
            WHEN COALESCE(b.grand_total, 0) > 0
            THEN GREATEST(r."reducedTotal", 0) / b.grand_total
            ELSE 0
          END AS factor
        FROM bills b
        JOIN reductions r ON r."billId" = b.id
        WHERE b.company_id = ${opts.companyId}
      ),
      updated_entries AS (
        UPDATE entries AS e
        SET
          rate = COALESCE(e.rate, 0) * factors.factor,
          value = COALESCE(e.value, 0) * factors.factor,
          tax = COALESCE((
            SELECT
              CASE
                WHEN c.tax_type::text = 'FIXED' THEN COALESCE(c.fixed_tax, 0)
                WHEN c.tax_type::text = 'VARIABLE' THEN
                  CASE
                    WHEN ((COALESCE(e.value, 0) * factors.factor) / COALESCE(NULLIF(e.qty, 0), 1)) > COALESCE(c.threshold_amount, 0)
                    THEN COALESCE(c.tax_above_threshold, 0)
                    ELSE COALESCE(c.tax_below_threshold, 0)
                  END
                ELSE COALESCE(e.tax, 0)
              END
            FROM categories c
            WHERE c.id = e.category_id
          ), COALESCE(e.tax, 0)),
          discount = 0
        FROM factors
        WHERE e.bill_id = factors.id
        RETURNING e.id
      ),
      updated_bills AS (
        UPDATE bills AS b
        SET
          subtotal = factors.new_total,
          grand_total = factors.new_total,
          discount = 0,
          updated_at = NOW()
        FROM factors
        WHERE b.id = factors.id
        RETURNING b.id, factors.old_total, factors.new_total
      )
      SELECT
        COUNT(*)::integer AS total_reduced_bills,
        COALESCE(SUM(old_total - new_total), 0)::double precision AS total_reduced_amount
      FROM updated_bills
    `);

    return {
      totalReducedBills: result?.total_reduced_bills ?? 0,
      totalReducedAmount: result?.total_reduced_amount ?? 0,
      reducedBillIds: reductions.map((row) => row.billId),
    };
  }, {
    maxWait: 1000000000,
    timeout: 1000000000,
  });
}
