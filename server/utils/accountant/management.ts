import { baseAmount, baseCurrencyTotals } from './reporting';
import { z } from 'zod';
import { Router, asyncHandler, badRequest, notFound, requireAuth, rbac } from './router';
import { accountantPrisma as prisma, logActivity, context } from './context';
import { assertAccountingDateUnlocked, replaceSystemJournal, voidSystemJournal, validatePosting, assertJournalApproval, cents } from './posting';
import { ensureDefaults, syncOpeningBalance } from './accounts';

export const accountantManagementRouter = Router();
accountantManagementRouter.use(requireAuth, rbac("ACCOUNT", "READ"));

const journalLine = z.object({
  accountId: z.string().cuid(),
  side: z.enum(["DEBIT", "CREDIT"]),
  amount: z.coerce.number().positive(),
  description: z.string().nullish(),
  partyId: z.string().cuid().nullish(),
  projectId: z.string().cuid().nullish(),
});
const journalLines = z
  .array(journalLine)
  .min(2)
  .superRefine((lines, ctx) => {
    const debit = lines
      .filter((x) => x.side === "DEBIT")
      .reduce((s, x) => s + x.amount, 0);
    const credit = lines
      .filter((x) => x.side === "CREDIT")
      .reduce((s, x) => s + x.amount, 0);
    if (Math.abs(debit - credit) > 0.005)
      ctx.addIssue({
        code: "custom",
        message: "Total debits must equal total credits",
      });
  });
const templateSchema = z.object({
  name: z.string().trim().min(1),
  referenceNumber: z.string().nullish(),
  notes: z.string().nullish(),
  journalType: z.enum(["BOTH", "CASH", "ACCRUAL"]).default("BOTH"),
  currency: z.string().length(3).default("INR"),
  exchangeRate: z.coerce.number().positive().default(1),
  templateMode: z.enum(["AMOUNT", "PERCENTAGE"]).default("AMOUNT"),
  lines: journalLines,
});
const recurringSchema = templateSchema
  .omit({ name: true, templateMode: true })
  .extend({
    profileName: z.string().trim().min(1),
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
    repeatEvery: z.coerce.number().int().min(1).max(99).default(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullish(),
    childStatus: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  });

function nextDate(date: Date, frequency: string, every: number, anchorDay = date.getUTCDate()) {
  const next = new Date(date);
  if (frequency === "DAILY") next.setUTCDate(next.getUTCDate() + every);
  else if (frequency === "WEEKLY")
    next.setUTCDate(next.getUTCDate() + every * 7);
  else {
    const day = anchorDay;
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + every * (frequency === 'MONTHLY' ? 1 : frequency === 'QUARTERLY' ? 3 : 12));
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, last));
  }
  return next;
}
async function validateAccountIds(companyId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (
    (await prisma.accountingAccount.count({
      where: { companyId, id: { in: unique }, isActive: true },
    })) !== unique.length
  )
    throw badRequest(
      "Every selected account must be active and belong to this company",
    );
}
async function createJournal(
  tx: any,
  input: {
    companyId: string;
    date: Date;
    notes: string;
    reference?: string | null;
    currency?: string;
    exchangeRate?: number;
    journalType?: string;
    status?: string;
    lines: Array<z.infer<typeof journalLine>>;
    sourceType: string;
    sourceId: string;
  },
) {
  await validatePosting(input.lines, input.date, input.companyId);
  const preference = await prisma.accountantPreference.findUnique({ where: { companyId: input.companyId } });
  if (['RECURRING_JOURNAL', 'THIRTEENTH_MONTH'].includes(input.sourceType) && preference?.journalApprovalType !== 'NONE' && preference?.journalApprovalType) input.status = 'DRAFT';
  return replaceSystemJournal(tx, input);
}

accountantManagementRouter.get(
  "/bootstrap",
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!;
    await ensureDefaults(companyId);
    const [company, accounts, parties, projects] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { currency: true, fyStartMonth: true },
      }),
      prisma.accountingAccount.findMany({
        where: { companyId, deletedAt: null },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      prisma.party.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, type: true },
        orderBy: { name: "asc" },
      }),
      prisma.project.findMany({
        where: { companyId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    res.json({ company, accounts, parties, projects });
  }),
);

accountantManagementRouter.get(
  "/account-details",
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!;
    const data = await prisma.accountingAccount.findMany({
      where: { companyId, deletedAt: null },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true, journalLines: true } },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    const totals = await baseCurrencyTotals({
      by: ["accountId", "side"],
      where: {
        companyId,
        deletedAt: null,
        journal: { status: "PUBLISHED", deletedAt: null },
      },
      _sum: { amount: true },
    });
    const movement = new Map<string, { debit: number; credit: number }>();
    for (const line of totals) {
      const value = movement.get(line.accountId) || { debit: 0, credit: 0 };
      value[line.side === "DEBIT" ? "debit" : "credit"] += Number(line._sum.amount || 0);
      movement.set(line.accountId, value);
    }
    res.json({ data: data.map((row) => {
      const value = movement.get(row.id) || { debit: 0, credit: 0 };
      return { ...row, balance: ["ASSET", "EXPENSE"].includes(row.category) ? value.debit - value.credit : value.credit - value.debit };
    }) });
  }),
);
accountantManagementRouter.get(
  "/sub-accounts",
  asyncHandler(async (req, res) => {
    const data = await prisma.accountingAccount.findMany({
      where: { companyId: req.user!.companyId!, deletedAt: null },
      include: {
        parent: { select: { id: true, name: true } },
        children: {
          where: { deletedAt: null },
          select: { id: true, name: true, accountType: true },
        },
      },
      orderBy: { name: "asc" },
    });
    res.json({ data });
  }),
);
accountantManagementRouter.get(
  "/account-transactions",
  asyncHandler(async (req, res) => {
    const accountId = z.string().cuid().optional().parse(req.query.accountId),
      companyId = req.user!.companyId!;
    const data = await prisma.manualJournalLine.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(accountId ? { accountId } : {}),
        journal: { status: "PUBLISHED", deletedAt: null },
      },
      include: {
        account: { select: { name: true, code: true } },
        journal: {
          select: {
            entryNumber: true,
            journalDate: true,
            referenceNumber: true,
            notes: true, exchangeRate: true,
            sourceType: true,
          },
        },
      },
      orderBy: { journal: { journalDate: "desc" } },

    });
    res.json({ data: data.map((line: any) => ({ ...line, amount: baseAmount(line) })) });
  }),
);
accountantManagementRouter.get(
  "/journal-credits",
  asyncHandler(async (req, res) => {
    const data = await prisma.manualJournalLine.findMany({
      where: {
        companyId: req.user!.companyId!,
        side: "CREDIT",
        deletedAt: null,
        journal: { status: "PUBLISHED", deletedAt: null },
      },
      include: {
        account: { select: { name: true, code: true } },
        journal: {
          select: {
            entryNumber: true,
            journalDate: true,
            notes: true, exchangeRate: true,
            referenceNumber: true,
          },
        },
      },
      orderBy: { journal: { journalDate: "desc" } },

    });
    res.json({ data: data.map((line: any) => ({ ...line, amount: baseAmount(line) })) });
  }),
);
accountantManagementRouter.get(
  "/reverse-journals",
  asyncHandler(async (req, res) => {
    const data = await prisma.manualJournal.findMany({
      where: {
        companyId: req.user!.companyId!,
        deletedAt: null,
        OR: [
          { reversedFromId: { not: null } },
          { reversalDate: { not: null } },
        ],
      },
      include: {
        reversedFrom: { select: { entryNumber: true } },
        reversals: {
          where: { deletedAt: null },
          select: { id: true, entryNumber: true, journalDate: true },
        },
      },
      orderBy: { journalDate: "desc" },
    });
    res.json({ data });
  }),
);

accountantManagementRouter.get(
  "/journal-templates",
  asyncHandler(async (req, res) =>
    res.json({
      data: await prisma.journalTemplate.findMany({
        where: { companyId: req.user!.companyId! },
        orderBy: { name: "asc" },
      }),
    }),
  ),
);
accountantManagementRouter.post(
  "/journal-templates",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!,
      body = templateSchema.parse(req.body);
    if (body.templateMode === "PERCENTAGE" && body.lines.filter(l => l.side === "DEBIT").reduce((sum,l) => sum+l.amount,0) !== 100) throw badRequest("Percentage templates require 100 percent on each side");
    await validateAccountIds(
      companyId,
      body.lines.map((x) => x.accountId),
    );
    res
      .status(201)
      .json(
        await prisma.journalTemplate.create({
          data: {
            companyId,
            ...body,
            referenceNumber: body.referenceNumber || null,
            notes: body.notes || null,
          },
        }),
      );
  }),
);
accountantManagementRouter.patch(
  "/journal-templates/:id",
  rbac("ACCOUNT", "UPDATE"),
  asyncHandler(async (req, res) => {
    const body = templateSchema.partial().parse(req.body),
      id = String(req.params.id);
    if (!(await prisma.journalTemplate.findFirst({ where: { id } })))
      throw notFound("Journal template");
    if (body.lines)
      await validateAccountIds(
        req.user!.companyId!,
        body.lines.map((x) => x.accountId),
      );
    res.json(
      await prisma.journalTemplate.update({ where: { id }, data: body as any }),
    );
  }),
);

accountantManagementRouter.get(
  "/recurring-journals",
  asyncHandler(async (req, res) =>
    res.json({
      data: await prisma.recurringJournalProfile.findMany({
        where: { companyId: req.user!.companyId! },
        orderBy: { nextRunDate: "asc" },
      }),
    }),
  ),
);
accountantManagementRouter.post(
  "/recurring-journals",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!,
      body = recurringSchema.parse(req.body);
    if (body.endDate && body.endDate < body.startDate) throw badRequest('End date cannot precede start date');
    await validateAccountIds(
      companyId,
      body.lines.map((x) => x.accountId),
    );
    res
      .status(201)
      .json(
        await prisma.recurringJournalProfile.create({
          data: {
            companyId,
            ...body,
            notes: body.notes || "Recurring journal",
            nextRunDate: body.startDate,
            referenceNumber: body.referenceNumber || null,
          },
        }),
      );
  }),
);
accountantManagementRouter.post(
  "/recurring-journals/:id/toggle",
  rbac("ACCOUNT", "UPDATE"),
  asyncHandler(async (req, res) => {
    const row = await prisma.recurringJournalProfile.findFirst({
      where: { id: String(req.params.id) },
    });
    if (!row) throw notFound("Recurring journal");
    res.json(
      await prisma.recurringJournalProfile.update({
        where: { id: row.id },
        data: { status: row.status === "ACTIVE" ? "STOPPED" : "ACTIVE" },
      }),
    );
  }),
);
accountantManagementRouter.post(
  "/recurring-journals/:id/generate",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const row = await prisma.recurringJournalProfile.findFirst({
      where: { id: String(req.params.id) },
    });
    if (!row) throw notFound("Recurring journal");
    if (row.endDate && row.nextRunDate > row.endDate) throw badRequest("The recurring schedule has ended");
    if (row.status !== "ACTIVE")
      throw badRequest("Recurring journal is stopped");
    const lines = journalLines.parse(row.lines);
    await validatePosting(lines, row.nextRunDate);
    await assertAccountingDateUnlocked(row.companyId, row.nextRunDate);
    const journal = await prisma.$transaction(async (tx) => {
      const created = await createJournal(tx, {
        companyId: row.companyId,
        date: row.nextRunDate,
        notes: row.notes,
        reference: row.referenceNumber,
        currency: row.currency,
        exchangeRate: Number(row.exchangeRate),
        journalType: row.journalType,
        status: row.childStatus,
        lines,
        sourceType: "RECURRING_JOURNAL",
        sourceId: `${row.id}:${row.nextRunDate.toISOString()}`,
      });
      const next = nextDate(row.nextRunDate, row.frequency, row.repeatEvery, row.startDate.getUTCDate());
      await tx.recurringJournalProfile.update({
        where: { id: row.id },
        data: {
          lastRunDate: row.nextRunDate,
          nextRunDate: next,
          status: row.endDate && next > row.endDate ? "COMPLETED" : row.status,
        },
      });
      return created;
    });
    res.status(201).json(journal);
  }),
);

const budgetSchema = z.object({
  name: z.string().trim().min(1),
  fiscalYear: z.coerce.number().int().min(2000).max(2200),
  periodType: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]).default("DRAFT"),
  allocations: z.array(
    z.object({
      accountId: z.string().cuid(),
      periods: z.array(z.coerce.number().nonnegative()).min(1).max(12),
    }),
  ),
  notes: z.string().nullish(),
});
accountantManagementRouter.get(
  "/budgets",
  asyncHandler(async (req, res) =>
    res.json({
      data: await prisma.accountingBudget.findMany({
        where: { companyId: req.user!.companyId! },
        orderBy: { fiscalYear: "desc" },
      }),
    }),
  ),
);
accountantManagementRouter.post(
  "/budgets",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!,
      body = budgetSchema.parse(req.body);
    await validateAccountIds(
      companyId,
      body.allocations.map((x) => x.accountId),
    );
    res
      .status(201)
      .json(
        await prisma.accountingBudget.create({
          data: { companyId, ...body, notes: body.notes || null },
        }),
      );
  }),
);
accountantManagementRouter.get(
  "/budgets/:id/actual",
  asyncHandler(async (req, res) => {
    const budget = await prisma.accountingBudget.findFirst({
      where: { id: String(req.params.id) },
    });
    if (!budget) throw notFound("Budget");
    const company = await prisma.company.findUnique({ where: { id: budget.companyId } });
    const month = (company.fyStartMonth || 4) - 1;
    const start = new Date(Date.UTC(budget.fiscalYear, month, 1)), end = new Date(Date.UTC(budget.fiscalYear + 1, month, 1));
    const lines = await prisma.manualJournalLine.findMany({
      where: {
        companyId: budget.companyId,
        deletedAt: null,
        journal: {
          status: "PUBLISHED",
          journalDate: { gte: start, lt: end },
          deletedAt: null,
        },
      },
      select: {
        accountId: true,
        side: true,
        amount: true,
        journal: { select: { journalDate: true, exchangeRate: true } },
        account: { select: { category: true } },
      },
    });
    const actual: Record<string, number[]> = {};
    for (const line of lines) {
      actual[line.accountId] ||= Array(12).fill(0);
      actual[line.accountId][(line.journal.journalDate.getUTCMonth() - month + 12) % 12] +=
        baseAmount(line) * ((["ASSET", "EXPENSE"].includes(line.account.category) ? line.side === "DEBIT" : line.side === "CREDIT") ? 1 : -1);
    }
    res.json({ budget, actual });
  }),
);

accountantManagementRouter.get(
  "/transaction-locks",
  asyncHandler(async (req, res) =>
    res.json({
      data: await prisma.transactionLock.findMany({
        where: { companyId: req.user!.companyId! },
        orderBy: { createdAt: "desc" },
      }),
    }),
  ),
);
accountantManagementRouter.post(
  "/transaction-locks",
  rbac("ACCOUNT", "UPDATE"),
  asyncHandler(async (req, res) => {
    const body = z
        .object({
          module: z.enum(["ALL", "BANKING", "ACCOUNTS"]),
          lockDate: z.coerce.date(),
          reason: z.string().trim().min(3),
        })
        .parse(req.body),
      companyId = req.user!.companyId!;
    await prisma.transactionLock.updateMany({
      where: { companyId, module: body.module, isLocked: true },
      data: {
        isLocked: false,
        unlockedAt: new Date(),
        unlockedById: req.user!.userId,
        unlockReason: "Superseded by a new lock",
      },
    });
    res
      .status(201)
      .json(
        await prisma.transactionLock.create({
          data: { companyId, ...body, lockedById: req.user!.userId },
        }),
      );
  }),
);
accountantManagementRouter.post(
  "/transaction-locks/:id/unlock",
  rbac("ACCOUNT", "UPDATE"),
  asyncHandler(async (req, res) => {
    const reason = z
        .object({ reason: z.string().trim().min(3) })
        .parse(req.body).reason,
      id = String(req.params.id);
    if (
      !(await prisma.transactionLock.findFirst({
        where: { id, isLocked: true },
      }))
    )
      throw notFound("Active transaction lock");
    res.json(
      await prisma.transactionLock.update({
        where: { id },
        data: {
          isLocked: false,
          unlockedAt: new Date(),
          unlockedById: req.user!.userId,
          unlockReason: reason,
        },
      }),
    );
  }),
);

accountantManagementRouter.get(
  "/opening-balances",
  asyncHandler(async (req, res) =>
    res.json({
      data: await prisma.accountOpeningBalance.findMany({
        where: { companyId: req.user!.companyId! },
        orderBy: { asOfDate: "desc" },
      }),
    }),
  ),
);
accountantManagementRouter.post(
  "/opening-balances",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!,
      body = z
        .object({
          accountId: z.string().cuid(),
          asOfDate: z.coerce.date(),
          side: z.enum(["DEBIT", "CREDIT"]),
          amount: z.coerce.number().positive(),
          currency: z.string().length(3).default("INR"),
          exchangeRate: z.coerce.number().positive().default(1),
          notes: z.string().nullish(),
        })
        .parse(req.body);
    await assertAccountingDateUnlocked(companyId, body.asOfDate);
    await validateAccountIds(companyId, [body.accountId]);
    const selected = await prisma.accountingAccount.findFirst({ where: { id: body.accountId } });
    if (!selected || !['ASSET', 'LIABILITY', 'EQUITY'].includes(selected.category)) throw badRequest('Opening balances require a balance-sheet account');
    const normal = ['ASSET', 'EXPENSE'].includes(selected.category) ? 'DEBIT' : 'CREDIT';
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (body.currency !== company.currency || body.exchangeRate !== 1) throw badRequest("Opening balances must be entered in company base currency");
    await syncOpeningBalance(prisma, selected, body.side === normal ? body.amount : -body.amount, body.asOfDate);
    const journal = await prisma.manualJournal.findFirst({ where: { sourceType: 'OPENING_BALANCE', sourceId: selected.id } });
    const row = await prisma.accountOpeningBalance.upsert({
      where: { companyId_accountId: { companyId, accountId: body.accountId } },
      create: { ...body, companyId, journalId: journal.id },
      update: { ...body, journalId: journal.id },
    });
    res.status(201).json(row);
  }),
);

const categorySchema = z.object({
  name: z.string().trim().min(1),
  assetAccountId: z.string().cuid(),
  accumulatedDepAccountId: z.string().cuid(),
  depreciationExpenseAccountId: z.string().cuid(),
  depreciationMethod: z
    .enum(["STRAIGHT_LINE", "DECLINING_BALANCE", "NONE"])
    .default("STRAIGHT_LINE"),
  usefulLifeMonths: z.coerce.number().int().positive(),
  salvagePercentage: z.coerce.number().min(0).max(100).default(0),
});
accountantManagementRouter.get(
  "/asset-categories",
  asyncHandler(async (req, res) =>
    res.json({
      data: await prisma.fixedAssetCategory.findMany({
        where: { companyId: req.user!.companyId! },
        orderBy: { name: "asc" },
      }),
    }),
  ),
);
accountantManagementRouter.post(
  "/asset-categories",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!,
      body = categorySchema.parse(req.body);
    await validateAccountIds(companyId, [
      body.assetAccountId,
      body.accumulatedDepAccountId,
      body.depreciationExpenseAccountId,
    ]);
    res
      .status(201)
      .json(
        await prisma.fixedAssetCategory.create({
          data: { companyId, ...body },
        }),
      );
  }),
);
const assetSchema = z.object({
  categoryId: z.string().cuid(),
  name: z.string().trim().min(1),
  description: z.string().nullish(),
  purchaseDate: z.coerce.date(),
  availableForUseDate: z.coerce.date(),
  purchaseCost: z.coerce.number().positive(),
  salvageValue: z.coerce.number().nonnegative().default(0),
  usefulLifeMonths: z.coerce.number().int().positive(),
  depreciationMethod: z
    .enum(["STRAIGHT_LINE", "DECLINING_BALANCE", "NONE"])
    .default("STRAIGHT_LINE"),
  serialNumber: z.string().nullish(),
  location: z.string().nullish(),
  vendorId: z.string().cuid().nullish(),
});
accountantManagementRouter.get(
  "/fixed-assets",
  asyncHandler(async (req, res) =>
    res.json({
      data: await prisma.fixedAsset.findMany({
        where: { companyId: req.user!.companyId! },
        orderBy: { createdAt: "desc" },
      }),
    }),
  ),
);
accountantManagementRouter.post(
  "/fixed-assets",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!,
      body = assetSchema.parse(req.body);
    if (
      !(await prisma.fixedAssetCategory.findFirst({
        where: { id: body.categoryId, companyId, isActive: true },
      }))
    )
      throw notFound("Active asset category");
    if (body.salvageValue > body.purchaseCost) throw badRequest('Salvage value cannot exceed purchase cost');
    if (body.availableForUseDate < body.purchaseDate) throw badRequest('Available-for-use date cannot precede purchase');
    if (body.vendorId && !await prisma.party.findFirst({ where: { id: body.vendorId } })) throw badRequest('Invalid vendor');
    cents(body.purchaseCost); cents(body.salvageValue);
    const assetNumber = `FA-${String((await prisma.fixedAsset.count({ where: { companyId } })) + 1).padStart(5, "0")}`;
    res
      .status(201)
      .json(
        await prisma.fixedAsset.create({
          data: {
            companyId,
            assetNumber,
            ...body,
            description: body.description || null,
            serialNumber: body.serialNumber || null,
            location: body.location || null,
            vendorId: body.vendorId || null,
            bookValue: body.purchaseCost,
            status: "ACTIVE",
          },
        }),
      );
  }),
);
accountantManagementRouter.get(
  "/depreciation",
  asyncHandler(async (req, res) =>
    res.json({
      data: await prisma.assetDepreciation.findMany({
        where: { companyId: req.user!.companyId! },
        orderBy: { depreciationDate: "desc" },
      }),
    }),
  ),
);
accountantManagementRouter.post(
  "/fixed-assets/:id/depreciate",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const date = z.object({ date: z.coerce.date() }).parse(req.body).date,
      asset = await prisma.fixedAsset.findFirst({
        where: { id: String(req.params.id) },
      });
    if (!asset) throw notFound("Fixed asset");
    if (asset.status !== "ACTIVE")
      throw badRequest("Only active assets can be depreciated");
    await assertAccountingDateUnlocked(asset.companyId, date);
    const category = await prisma.fixedAssetCategory.findFirst({
      where: { id: asset.categoryId },
    });
    if (!category) throw notFound("Asset category");
    if (asset.depreciationMethod === 'NONE') throw badRequest('This asset does not depreciate');
    if (date < asset.availableForUseDate) throw badRequest('Depreciation cannot precede the available-for-use date');
    if (asset.lastDepreciationDate && date.toISOString().slice(0, 7) <= asset.lastDepreciationDate.toISOString().slice(0, 7)) throw badRequest('Depreciation is already posted through this month');
    const depreciable = Number(asset.purchaseCost) - Number(asset.salvageValue),
      amount = Math.round(Math.min(
        Number(asset.bookValue) - Number(asset.salvageValue),
        asset.depreciationMethod === "DECLINING_BALANCE"
          ? (Number(asset.bookValue) * 2) / asset.usefulLifeMonths
          : depreciable / asset.usefulLifeMonths,
      ) * 100) / 100;
    if (amount <= 0) throw badRequest("Asset is fully depreciated");
    const result = await prisma.$transaction(async (tx) => {
      const dep = await tx.assetDepreciation.create({
        data: {
          companyId: asset.companyId,
          assetId: asset.id,
          depreciationDate: date,
          amount,
          accumulatedAfter: Number(asset.accumulatedDepreciation) + amount,
          bookValueAfter: Number(asset.bookValue) - amount,
        },
      });
      const journal = await createJournal(tx, {
        companyId: asset.companyId,
        date,
        notes: `Depreciation for ${asset.assetNumber} - ${asset.name}`,
        lines: [
          {
            accountId: category.depreciationExpenseAccountId,
            side: "DEBIT",
            amount,
          },
          {
            accountId: category.accumulatedDepAccountId,
            side: "CREDIT",
            amount,
          },
        ],
        sourceType: "ASSET_DEPRECIATION",
        sourceId: dep.id,
      });
      await tx.assetDepreciation.update({
        where: { id: dep.id },
        data: { journalId: journal.id },
      });
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: {
          accumulatedDepreciation:
            Number(asset.accumulatedDepreciation) + amount,
          bookValue: Number(asset.bookValue) - amount,
          lastDepreciationDate: date,
          status:
            Number(asset.bookValue) - amount <= Number(asset.salvageValue)
              ? "FULLY_DEPRECIATED"
              : "ACTIVE",
        },
      });
      return dep;
    });
    res.status(201).json(result);
  }),
);
accountantManagementRouter.get(
  "/asset-disposals",
  asyncHandler(async (req, res) =>
    res.json({
      data: await prisma.assetDisposal.findMany({
        where: { companyId: req.user!.companyId! },
        orderBy: { disposalDate: "desc" },
      }),
    }),
  ),
);
accountantManagementRouter.post(
  "/fixed-assets/:id/dispose",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const body = z
        .object({
          disposalDate: z.coerce.date(),
          disposalMethod: z.enum(["SALE", "SCRAP", "WRITE_OFF"]),
          proceeds: z.coerce.number().nonnegative().default(0),
          proceedsAccountId: z.string().cuid().nullish(),
          gainLossAccountId: z.string().cuid(),
          notes: z.string().nullish(),
        })
        .parse(req.body),
      asset = await prisma.fixedAsset.findFirst({
        where: { id: String(req.params.id) },
      });
    if (!asset) throw notFound("Fixed asset");
    if (!["ACTIVE", "FULLY_DEPRECIATED"].includes(asset.status))
      throw badRequest("Asset is not available for disposal");
    await assertAccountingDateUnlocked(asset.companyId, body.disposalDate);
    const category = await prisma.fixedAssetCategory.findFirst({
      where: { id: asset.categoryId },
    });
    if (!category) throw notFound("Asset category");
    if (body.proceeds > 0 && !body.proceedsAccountId)
      throw badRequest("Proceeds account is required for an asset sale");
    await validateAccountIds(asset.companyId, [
      body.gainLossAccountId,
      ...(body.proceedsAccountId ? [body.proceedsAccountId] : []),
    ]);
    if (body.disposalDate < (asset.lastDepreciationDate || asset.purchaseDate)) throw badRequest("Disposal cannot precede acquisition or depreciation");
    const book = Number(asset.bookValue),
      gainLoss = body.proceeds - book;
    const lines: any[] = [
      {
        accountId: category.assetAccountId,
        side: "CREDIT",
        amount: Number(asset.purchaseCost),
      },
    ];
    if (Number(asset.accumulatedDepreciation) > 0)
      lines.push({
        accountId: category.accumulatedDepAccountId,
        side: "DEBIT",
        amount: Number(asset.accumulatedDepreciation),
      });
    if (body.proceeds > 0)
      lines.push({
        accountId: body.proceedsAccountId!,
        side: "DEBIT",
        amount: body.proceeds,
      });
    if (gainLoss < 0)
      lines.push({
        accountId: body.gainLossAccountId,
        side: "DEBIT",
        amount: -gainLoss,
      });
    else if (gainLoss > 0)
      lines.push({
        accountId: body.gainLossAccountId,
        side: "CREDIT",
        amount: gainLoss,
      });
    const result = await prisma.$transaction(async (tx) => {
      const disposal = await tx.assetDisposal.create({
        data: {
          companyId: asset.companyId,
          assetId: asset.id,
          ...body,
          proceedsAccountId: body.proceedsAccountId || null,
          notes: body.notes || null,
          gainLoss,
        },
      });
      const journal = await createJournal(tx, {
        companyId: asset.companyId,
        date: body.disposalDate,
        notes: body.notes || `Disposal of ${asset.assetNumber}`,
        lines,
        sourceType: "ASSET_DISPOSAL",
        sourceId: disposal.id,
      });
      await tx.assetDisposal.update({
        where: { id: disposal.id },
        data: { journalId: journal.id },
      });
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: { status: "DISPOSED", bookValue: 0 },
      });
      return disposal;
    });
    res.status(201).json(result);
  }),
);


async function postCurrencyAdjustment(row: any) {
  await assertAccountingDateUnlocked(row.companyId, row.adjustmentDate);
  await validateAccountIds(row.companyId, [row.accountId, row.gainLossAccountId]);
  if (row.accountId === row.gainLossAccountId) throw badRequest('The revalued account and gain/loss account must differ');
  const account = await prisma.accountingAccount.findFirst({ where: { id: row.accountId } });
  const company = await prisma.company.findUnique({ where: { id: row.companyId } });
  const amount = Math.abs(Number(row.gainLoss));
  let journalId = null;
  if (amount) {
    const debit = (Number(row.gainLoss) > 0) === ['ASSET', 'EXPENSE'].includes(account.category);
    const journal = await createJournal(prisma, {
      companyId: row.companyId, date: row.adjustmentDate, notes: row.notes || `Currency adjustment ${row.adjustmentNumber}`,
      currency: company.currency, exchangeRate: 1,
      lines: [{ accountId: row.accountId, side: debit ? 'DEBIT' : 'CREDIT', amount },
        { accountId: row.gainLossAccountId, side: debit ? 'CREDIT' : 'DEBIT', amount }],
      sourceType: row.adjustmentType, sourceId: row.id,
    });
    journalId = journal.id;
  }
  return prisma.currencyAdjustment.update({ where: { id: row.id }, data: { status: 'POSTED', journalId } });
}
accountantManagementRouter.post('/currency-adjustments/:id/publish', rbac('ACCOUNT', 'UPDATE'), asyncHandler(async (req, res) => {
  const row = await prisma.currencyAdjustment.findFirst({ where: { id: req.params.id } });
  if (!row || row.status !== 'DRAFT') throw badRequest('Only draft currency adjustments can be published');
  res.json(await postCurrencyAdjustment(row));
}));

const adjustmentSchema = z.object({
  adjustmentDate: z.coerce.date(),
  adjustmentType: z.enum(["BASE_CURRENCY", "CURRENCY_REVALUATION"]),
  currency: z.string().length(3),
  exchangeRate: z.coerce.number().positive(),
  accountId: z.string().cuid(),
  gainLossAccountId: z.string().cuid(),
  foreignBalance: z.coerce.number(),
  baseBalanceBefore: z.coerce.number(),
  notes: z.string().nullish(),
  publish: z.boolean().default(false),
});
accountantManagementRouter.get(
  "/currency-adjustments",
  asyncHandler(async (req, res) => {
    const type = z
      .enum(["BASE_CURRENCY", "CURRENCY_REVALUATION"])
      .optional()
      .parse(req.query.type);
    res.json({
      data: await prisma.currencyAdjustment.findMany({
        where: {
          companyId: req.user!.companyId!,
          ...(type ? { adjustmentType: type } : {}),
        },
        orderBy: { adjustmentDate: "desc" },
      }),
    });
  }),
);
accountantManagementRouter.post(
  "/currency-adjustments",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!,
      body = adjustmentSchema.parse(req.body);
    await assertAccountingDateUnlocked(companyId, body.adjustmentDate);
    await validateAccountIds(companyId, [
      body.accountId,
      body.gainLossAccountId,
    ]);
    const baseBalanceAfter = Math.round(body.foreignBalance * body.exchangeRate * 100) / 100,
      gainLoss = Math.round((baseBalanceAfter - body.baseBalanceBefore) * 100) / 100,
      adjustmentNumber = `CA-${String((await prisma.currencyAdjustment.count({ where: { companyId } })) + 1).padStart(5, "0")}`;
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.currencyAdjustment.create({
        data: {
          companyId,
          adjustmentNumber,
          ...Object.fromEntries(Object.entries(body).filter(([key]) => key !== "publish")),
          notes: body.notes || null,
          baseBalanceAfter,
          gainLoss,
          status: body.publish ? "POSTED" : "DRAFT",
        },
      });
      if (body.publish) return postCurrencyAdjustment(row);
      return row;
    });
    res.status(201).json(result);
  }),
);

accountantManagementRouter.get(
  "/thirteenth-month-journals",
  asyncHandler(async (req, res) => {
    const data = await prisma.manualJournal.findMany({
      where: {
        companyId: req.user!.companyId!,
        sourceType: "THIRTEENTH_MONTH",
        deletedAt: null,
      },
      include: {
        lines: {
          where: { deletedAt: null },
          include: { account: { select: { name: true } } },
        },
      },
      orderBy: { journalDate: "desc" },
    });
    res.json({ data });
  }),
);
accountantManagementRouter.post(
  "/thirteenth-month-journals",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!,
      body = z
        .object({
          fiscalYear: z.coerce.number().int(),
          journalDate: z.coerce.date(),
          referenceNumber: z.string().nullish(),
          notes: z.string().min(1),
          journalType: z.enum(["BOTH", "CASH", "ACCRUAL"]).default("BOTH"),
          status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
          lines: journalLines,
        })
        .parse(req.body);
    const pref = await prisma.accountantPreference.findUnique({
      where: { companyId },
    });
    if (!pref?.allowThirteenthMonth)
      throw badRequest(
        "Enable thirteenth-month adjustment journals in Accountant Preferences first",
      );
    await assertAccountingDateUnlocked(companyId, body.journalDate);
    await validateAccountIds(
      companyId,
      body.lines.map((x) => x.accountId),
    );
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { fyStartMonth: true },
    });
    const fiscalEndMonth = ((company?.fyStartMonth || 1) + 10) % 12;
    const fiscalEndYear = body.fiscalYear + ((company?.fyStartMonth || 1) === 1 ? 0 : 1);
    if (body.journalDate.getUTCFullYear() !== fiscalEndYear) throw badRequest('Journal date must belong to the selected fiscal year');
    if (body.journalDate.getUTCMonth() !== fiscalEndMonth)
      throw badRequest(
        "Thirteenth-month adjustments must be dated in the final month of the fiscal year",
      );
    const sourceId = `${body.fiscalYear}:${Date.now()}`;
    const journal = await prisma.$transaction((tx) =>
      createJournal(tx, {
        companyId,
        date: body.journalDate,
        reference: body.referenceNumber,
        notes: body.notes,
        journalType: body.journalType,
        status: body.status,
        lines: body.lines,
        sourceType: "THIRTEENTH_MONTH",
        sourceId,
      }),
    );
    res.status(201).json(journal);
  }),
);

accountantManagementRouter.get(
  "/preferences",
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!;
    res.json(
      await prisma.accountantPreference.upsert({
        where: { companyId },
        update: {},
        create: { companyId },
      }),
    );
  }),
);
accountantManagementRouter.put(
  "/preferences",
  rbac("ACCOUNT", "UPDATE"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!,
      body = z
        .object({
          fyStartMonth: z.coerce.number().int().min(1).max(12).default(4),
          recurringChildStatus: z.enum(["DRAFT", "PUBLISHED"]),
          allowThirteenthMonth: z.boolean(),
          journalApprovalType: z.enum(["NONE", "SIMPLE", "MULTI_LEVEL"]),
          allowSelfApproval: z.boolean(),
          unrealizedGainAccountId: z.string().cuid().nullish(),
          unrealizedLossAccountId: z.string().cuid().nullish(),
          journalCustomFields: z
            .array(
              z.object({
                label: z.string().min(1),
                type: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN"]),
                required: z.boolean().default(false),
              }),
            )
            .default([]),
        })
        .parse(req.body);
    if (req.user.role !== 'admin') throw badRequest('Only an administrator can change accounting preferences');
    await validateAccountIds(companyId, [body.unrealizedGainAccountId, body.unrealizedLossAccountId].filter(Boolean) as string[]);
    res.json(
      await prisma.accountantPreference.upsert({
        where: { companyId },
        update: body,
        create: { companyId, ...body },
      }),
    );
  }),
);
accountantManagementRouter.get(
  "/clients",
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!;
    const data = await prisma.accountantClient.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
    const ids = data.map((x) => x.partyId),
      parties = await prisma.party.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true, phone: true },
      });
    res.json({
      data: data.map((x) => ({
        ...x,
        party: parties.find((p) => p.id === x.partyId),
      })),
    });
  }),
);
accountantManagementRouter.post(
  "/clients",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!,
      body = z
        .object({
          partyId: z.string().cuid(),
          serviceType: z.enum(["BOOKKEEPING", "TAX", "AUDIT", "FULL_SERVICE"]),
          accessLevel: z.enum(["VIEWER", "ACCOUNTANT", "ADMIN"]),
          fiscalYearEndMonth: z.coerce.number().int().min(1).max(12),
          notes: z.string().nullish(),
        })
        .parse(req.body);
    const party = await prisma.party.findFirst({
      where: { id: body.partyId, companyId, type: "CLIENT" },
    });
    if (!party) throw notFound("Customer");
    res
      .status(201)
      .json(
        await prisma.accountantClient.create({
          data: { companyId, ...body, notes: body.notes || null },
        }),
      );
  }),
);

accountantManagementRouter.post(
  "/bulk-update/accounts",
  rbac("ACCOUNT", "UPDATE"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!,
      body = z
        .object({
          accountIds: z.array(z.string().cuid()).min(1),
          isActive: z.boolean().optional(),
          showOnDashboard: z.boolean().optional(),

        })
        .refine(
          (x) =>
            x.isActive !== undefined ||
            x.showOnDashboard !== undefined,
          "Select a field to update",
        )
        .parse(req.body);
    if (await prisma.accountingAccount.count({ where: { id: { in: [...new Set(body.accountIds)] }, deletedAt: null } }) !== new Set(body.accountIds).size) throw badRequest('Invalid accounts');
    if (body.isActive === false && await prisma.accountingAccount.count({ where: { parentId: { in: body.accountIds }, id: { notIn: body.accountIds }, isActive: true, deletedAt: null } })) throw badRequest('Mark active sub-accounts inactive first');
    const { accountIds, ...data } = body;
    const result = await prisma.accountingAccount.updateMany({
      where: {
        companyId,
        id: { in: accountIds },
        isSystem: data.isActive === false ? false : undefined,
      },
      data,
    });
    await logActivity({
      companyId,
      userId: req.user!.userId,
      action: "bulk updated",
      resource: "accounting-account",
      resourceId: accountIds.join(","),
      meta: { count: result.count, fields: Object.keys(data) },
    });
    res.json(result);
  }),
);
