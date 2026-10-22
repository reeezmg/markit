import { prisma } from '~/server/prisma';
import { defineEventHandler } from 'h3';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';

export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event);
  const companyId = session.data.companyId;
  const body = await readBody(event);
  const { clientId, grandTotal } = body;
  if (typeof clientId !== 'string' || !clientId || typeof grandTotal !== 'number' || !Number.isFinite(grandTotal) || grandTotal < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Valid client and bill total are required' });
  }
  if (body.companyId && body.companyId !== companyId) throw createError({ statusCode: 403, statusMessage: 'Mixed company request' });
  const member = await prisma.companyClient.findUnique({ where: { companyId_clientId: { companyId, clientId } } });
  if (!member) throw createError({ statusCode: 403, statusMessage: 'Client does not belong to this company' });

  const now = new Date();

  // 1. Fetch all GENERATE coupons
  const coupons = await prisma.coupon.findMany({
    where: {
      companyId,
      audienceType: 'GENERATE',
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: {
      clients: { select: { clientId: true, usageLimit: true } }, // CouponClient rows
    }
  });

  const generatableCoupons: any[] = [];

  for (const coupon of coupons) {
    let totalValue = grandTotal;

    // 🔹 If bill combine → sum bills between start & end
    if (coupon.isBillCombine) {
      const bills = await prisma.bill.aggregate({
        _sum: { grandTotal: true },
        where: {
          companyId,
          clientId,
          deleted: false,
          createdAt: {
            gte: coupon.startDate,
            lte: coupon.endDate,
          },
        },
      });
      totalValue = (bills._sum.grandTotal || 0) + grandTotal;
    }

    // 🔹 Must meet minimum bill amount
    if (coupon.minBillAmount && totalValue < coupon.minBillAmount) {
      continue;
    }


    // 🔹 How many times this client already has this coupon
    const alreadyGiven = coupon.clients
      .filter(c => c.clientId === clientId)
      .reduce((sum, row) => sum + Math.max(0, Number(row?.usageLimit ?? 1) || 0), 0);

    // 🔹 Eligible count based on multiples of minBillAmount
    const eligibleCount = Math.floor(totalValue / (coupon.minBillAmount || 1));

    // 🔹 How many NEW coupons to issue
    let newCoupons = eligibleCount ;

    // Respect per-client limit
    const perClientLimit = coupon.perClientLimit || Infinity;
    newCoupons = Math.min(newCoupons, perClientLimit - alreadyGiven);

    // Respect global usage limit
    if (coupon.usageLimit) {
      const remainingGlobal = coupon.usageLimit - coupon.timesUsed;
      newCoupons = Math.min(newCoupons, remainingGlobal);
    }
   
    if (newCoupons > 0) {
      // ✅ Insert new CouponClient rows (duplicates allowed)
      const data = Array.from({ length: newCoupons }, () => ({
        couponId: coupon.id,
        clientId,
        usageLimit: 1,
      }));

      await prisma.couponClient.createMany({
        data,
      });



      // ✅ Push coupon multiple times into response
      for (let i = 0; i < newCoupons; i++) {
        generatableCoupons.push(coupon);
      }
    }
  }

  return { generatableCoupons };
});
