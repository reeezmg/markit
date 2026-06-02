import { prisma } from '~/server/prisma';

type BillPreviewOptions = {
  companyId: string;
  startDate: Date;
  endDate: Date;
  paymentMethod: string;
  targetAmount: number;
  minBillAmount: number;
  reducePercent?: number;
  reductionRules?: ReductionRuleInput[];
  timePref: 'oldest' | 'newest';
  valuePref: 'lowest' | 'highest';
};

type ReductionRuleInput = {
  fromAmount?: number | string;
  toAmount?: number | string;
  reducePercent?: number | string;
};

function normalizeReductionRules(rules?: ReductionRuleInput[], reducePercent = 100) {
  const normalized = (Array.isArray(rules) ? rules : [])
    .map((rule) => ({
      fromAmount: Math.max(0, Number(rule.fromAmount || 0)),
      toAmount: Math.max(0, Number(rule.toAmount || 0)),
      reducePercent: Math.min(100, Math.max(0, Number(rule.reducePercent || 0))),
    }))
    .filter((rule) => rule.reducePercent > 0);

  if (normalized.length) {
    return normalized;
  }

  return [{
    fromAmount: 0,
    toAmount: 0,
    reducePercent: Math.min(100, Math.max(0, Number(reducePercent || 0))),
  }];
}

function findReductionRule(billTotal: number, rules: ReturnType<typeof normalizeReductionRules>) {
  return rules.find((rule) => {
    const withinLowerBound = billTotal >= rule.fromAmount;
    const withinUpperBound = rule.toAmount <= 0 || billTotal < rule.toAmount;
    return withinLowerBound && withinUpperBound;
  });
}

export async function previewBillsForReduction(opts: BillPreviewOptions) {
  const {
    companyId,
    startDate,
    endDate,
    paymentMethod,
    targetAmount,
    minBillAmount,
    reducePercent = 100,
    reductionRules,
    timePref,
    valuePref,
  } = opts;

  const [bills] = await prisma.$transaction(async (tx) => {
    const bills = await tx.bill.findMany({
      where: {
        companyId,
        deleted: false,
        precedence: { not: true },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: [
        { grandTotal: valuePref === 'lowest' ? 'asc' : 'desc' },
        { createdAt: timePref === 'oldest' ? 'asc' : 'desc' },
      ],
    });
    return [bills];
  });


  const allTotal = bills.reduce((sum, b) => sum + (b.grandTotal ?? 0), 0);
  const allCount = bills.length;
  const reductionTarget = Math.max(0, targetAmount);
  let remainingReductionAmount = Math.max(0, allTotal - reductionTarget);
  const normalizedReductionRules = normalizeReductionRules(reductionRules, reducePercent);

  // track least invoice number (just numeric now)
  let leastInvoice: number | null = null;
  const preview: any[] = [];
  const reductionPlan: any[] = [];

  let deletedTotal = 0;

  for (const bill of bills) {
    // if (!bill.invoiceNumber) continue;

    const billTotal = bill.grandTotal ?? 0;
    const num = bill.invoiceNumber ?? 0;

    // Always track least invoice number
    if (leastInvoice === null || num < leastInvoice) {
      leastInvoice = num;
    }

    let reduceBy = 0;
    let reducedTotal = billTotal;
    const reductionRule = findReductionRule(billTotal, normalizedReductionRules);

    const eligibleForDeletion =
      (!paymentMethod || bill.paymentMethod === paymentMethod) &&
      billTotal >= minBillAmount;

    const eligibleForReduction =
      (!paymentMethod || bill.paymentMethod === paymentMethod) &&
      !!reductionRule;

    if (eligibleForReduction && reductionRule && remainingReductionAmount > 0) {
      const maxBillReduction = billTotal * (reductionRule.reducePercent / 100);
      reduceBy = Math.min(maxBillReduction, remainingReductionAmount);
      reducedTotal = billTotal - reduceBy;
      remainingReductionAmount -= reduceBy;
      if (reduceBy > 0) {
        reductionPlan.push({
          billId: bill.id,
          invoiceNumber: bill.invoiceNumber,
          billTotal,
          reducedTotal,
          reduceBy,
          reducePercent: reductionRule.reducePercent,
          reductionRule: `${reductionRule.fromAmount} - ${reductionRule.toAmount || 'No limit'}`,
          ruleFromAmount: reductionRule.fromAmount,
          ruleToAmount: reductionRule.toAmount,
        });
      }
    }

    // IGNORE: if paymentMethod doesn't match
    if (paymentMethod && bill.paymentMethod !== paymentMethod) {
      preview.push({
        action: 'ignore',
        reduceAction: reduceBy > 0 ? 'reduce' : 'keep',
        invoiceNumber: bill.invoiceNumber ,
        billId: bill.id,
        paymentMethod: bill.paymentMethod,
        billTotal,
        reducedTotal,
        reduceBy,
        reducePercent: reductionRule?.reducePercent ?? 0,
      });
      continue;
    }

    const remainingAfterDelete = allTotal - deletedTotal - billTotal;

    // DELETE only if:
    // 1. bill >= minBillAmount
    // 2. remaining total won't drop below target
    if (
      eligibleForDeletion &&
      remainingAfterDelete >= targetAmount
    ) {
      deletedTotal += billTotal;
      preview.push({
        action: 'delete',
        reduceAction: reduceBy > 0 ? 'reduce' : 'keep',
        invoiceNumber: bill.invoiceNumber ,
        billId: bill.id,
        paymentMethod: bill.paymentMethod,
        billTotal,
        reducedTotal,
        reduceBy,
        reducePercent: reductionRule?.reducePercent ?? 0,
      });
    } else {
      preview.push({
        action: 'keep',
        reduceAction: reduceBy > 0 ? 'reduce' : 'keep',
        invoiceNumber: bill.invoiceNumber ,
        billId: bill.id,
        paymentMethod: bill.paymentMethod,
        billTotal,
        reducedTotal,
        reduceBy,
        reducePercent: reductionRule?.reducePercent ?? 0,
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
    reductionPlan,
    reductionRules: normalizedReductionRules,
    reductionAmount: reductionPlan.reduce((sum, b) => sum + b.reduceBy, 0),
    reductionRemainingAmount: remainingReductionAmount,
    reducedBillsCount: reductionPlan.length,
    leastInvoice, // now a single number instead of per-prefix
    preview,
  };
}
