import { baseAmount, baseCurrencyTotals } from './reporting';
import { z } from 'zod';
import { Router, asyncHandler, badRequest, notFound, requireAuth, rbac } from './router';
import { accountantPrisma as prisma, logActivity, context } from './context';
import { assertAccountingDateUnlocked, replaceSystemJournal, voidSystemJournal, cents } from './posting';

export const accountingAccountRouter = Router();
accountingAccountRouter.use(requireAuth);

const types = [
  "OTHER_ASSET",
  "OTHER_CURRENT_ASSET",
  "CASH",
  "BANK",
  "FIXED_ASSET",
  "ACCOUNTS_RECEIVABLE",
  "STOCK",
  "PAYMENT_CLEARING_ACCOUNT",
  "INTANGIBLE_ASSET",
  "NON_CURRENT_ASSET",
  "DEFERRED_TAX_ASSET",
  "OTHER_CURRENT_LIABILITY",
  "CREDIT_CARD",
  "NON_CURRENT_LIABILITY",
  "OTHER_LIABILITY",
  "ACCOUNTS_PAYABLE",
  "OVERSEAS_TAX_PAYABLE",
  "DEFERRED_TAX_LIABILITY",
  "EQUITY",
  "INCOME",
  "OTHER_INCOME",
  "EXPENSE",
  "COST_OF_GOODS_SOLD",
  "OTHER_EXPENSE",
] as const;

const categories: Record<
  (typeof types)[number],
  "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"
> = {
  OTHER_ASSET: "ASSET",
  OTHER_CURRENT_ASSET: "ASSET",
  CASH: "ASSET",
  BANK: "ASSET",
  FIXED_ASSET: "ASSET",
  ACCOUNTS_RECEIVABLE: "ASSET",
  STOCK: "ASSET",
  PAYMENT_CLEARING_ACCOUNT: "ASSET",
  INTANGIBLE_ASSET: "ASSET",
  NON_CURRENT_ASSET: "ASSET",
  DEFERRED_TAX_ASSET: "ASSET",
  OTHER_CURRENT_LIABILITY: "LIABILITY",
  CREDIT_CARD: "LIABILITY",
  NON_CURRENT_LIABILITY: "LIABILITY",
  OTHER_LIABILITY: "LIABILITY",
  ACCOUNTS_PAYABLE: "LIABILITY",
  OVERSEAS_TAX_PAYABLE: "LIABILITY",
  DEFERRED_TAX_LIABILITY: "LIABILITY",
  EQUITY: "EQUITY",
  INCOME: "INCOME",
  OTHER_INCOME: "INCOME",
  EXPENSE: "EXPENSE",
  COST_OF_GOODS_SOLD: "EXPENSE",
  OTHER_EXPENSE: "EXPENSE",
};

const subAccountTypes = new Set([
  "ACCOUNTS_PAYABLE",
  "OTHER_ASSET",
  "OTHER_CURRENT_ASSET",
  "CASH",
  "FIXED_ASSET",
  "STOCK",
  "INTANGIBLE_ASSET",
  "NON_CURRENT_ASSET",
  "OTHER_CURRENT_LIABILITY",
  "NON_CURRENT_LIABILITY",
  "OTHER_LIABILITY",
  "EQUITY",
  "INCOME",
  "OTHER_INCOME",
  "EXPENSE",
  "COST_OF_GOODS_SOLD",
  "OTHER_EXPENSE",
]);

const accountSchema = z.object({
  accountType: z.enum(types),
  name: z.string().trim().min(1).max(150),
  code: z.string().trim().max(50).nullable().optional(),
  currency: z.string().trim().length(3).default("INR"),
  description: z.string().trim().max(1000).nullable().optional(),
  showOnDashboard: z.boolean().default(false),
  parentId: z.string().cuid().nullable().optional(),
  bankName: z.string().trim().max(150).nullable().optional(),
  accountNumber: z.string().trim().max(80).nullable().optional(),
  routingNumber: z.string().trim().max(80).nullable().optional(),
  isPrimary: z.boolean().default(false),
  openingBalance: z.coerce.number().nullable().optional(),
  openingBalanceDate: z.string().trim().min(1).nullable().optional(),
});

const OPENING_BALANCE_SOURCE = "OPENING_BALANCE";
const OPENING_BALANCE_OFFSET = "Opening Balance Adjustments";
// Opening balances describe where a balance-sheet account stood on the migration
// date; income and expense accounts always start a period at zero.
const openingBalanceCategories = new Set(["ASSET", "LIABILITY", "EQUITY"]);

export const coreAccountDefaults = [
  ["Accounts Receivable", "1100", "ACCOUNTS_RECEIVABLE"],
  ["Petty Cash", "1001", "CASH"],
  ["Undeposited Funds", "1010", "CASH"],
  ["Payment Clearing", "1190", "PAYMENT_CLEARING_ACCOUNT"],
  ["Stock", "1200", "STOCK"],
  ["Input GST", "1210", "OTHER_CURRENT_ASSET"],
  ["Accounts Payable", "2100", "ACCOUNTS_PAYABLE"],
  ["Unearned Revenue", "2200", "OTHER_CURRENT_LIABILITY"],
  ["Employee Reimbursements", "2210", "OTHER_CURRENT_LIABILITY"],
  ["Opening Balance Adjustments", "2220", "OTHER_CURRENT_LIABILITY"],
  ["TDS Payable", "2230", "OTHER_CURRENT_LIABILITY"],
  ["Owner's Equity", "3000", "EQUITY"],
  ["Sales", "4000", "INCOME"],
  ["Sales Returns", "4010", "EXPENSE"],
  ["Output GST", "2240", "OTHER_CURRENT_LIABILITY"],
  ["Vendor Advances", "1250", "OTHER_CURRENT_ASSET"],
  ["General Expenses", "5000", "EXPENSE"],
  ["Cost of Goods Sold", "5100", "COST_OF_GOODS_SOLD"],
] as const;

export async function ensureDefaults(companyId: string) {
  await prisma.accountingAccount.createMany({
    data: coreAccountDefaults.map(([name, code, accountType]) => ({
      companyId,
      name,
      code,
      accountType,
      category: categories[accountType],
      isSystem: true,
    })),
    skipDuplicates: true,
  });
  const existing = await prisma.accountingAccount.findFirst({
    where: { accountType: 'BANK', OR: [{ name: 'Primary Bank' }, { isPrimary: true }] },
    orderBy: { isPrimary: 'desc' },
  });
  if (existing) {
    if (!existing.isPrimary || !existing.isSystem) await prisma.accountingAccount.update({
      where: { id: existing.id }, data: { isPrimary: true, isSystem: true },
    });
    return;
  }
  const [company] = await context().db.$queryRawUnsafe(
    'SELECT to_jsonb(c) AS details FROM companies c WHERE id=$1', companyId) as {
      details: {
        bank_name?: string | null;
        account_no?: string | null;
        ifsc?: string | null;
        acc_holder_name?: string | null;
        upi_id?: string | null;
      } | null;
    }[];
  const details = company?.details || {};
  await prisma.accountingAccount.create({ data: {
    name: 'Primary Bank', accountType: 'BANK', category: 'ASSET', isPrimary: true, isSystem: true,
    bankName: details.bank_name || null, accountNumber: details.account_no || null,
    routingNumber: details.ifsc || null,
    description: [details.acc_holder_name && `Account holder: ${details.acc_holder_name}`,
      details.upi_id && `UPI: ${details.upi_id}`].filter(Boolean).join('\n') || null,
  } });
}

async function validateParent(
  parentId: string | null | undefined,
  accountType: (typeof types)[number],
  accountId?: string,
) {
  if (!parentId) return null;
  if (!subAccountTypes.has(accountType))
    throw badRequest("This account type does not support sub-accounts");
  if (parentId === accountId)
    throw badRequest("An account cannot be its own parent");
  const parent = await prisma.accountingAccount.findFirst({
    where: { id: parentId },
  });
  if (!parent) throw notFound("Parent account");
  if (!parent.isActive) throw badRequest("Parent account must be active");
  if (parent.accountType !== accountType)
    throw badRequest("Parent and sub-account must have the same account type");
  let depth = 1;
  let cursor = parent.parentId;
  while (cursor) {
    if (cursor === accountId)
      throw badRequest("A circular account hierarchy is not allowed");
    const ancestor = await prisma.accountingAccount.findFirst({
      where: { id: cursor },
    });
    cursor = ancestor?.parentId ?? null;
    depth += 1;
    if (depth >= 5)
      throw badRequest("Account nesting is limited to five levels");
  }
  return parent.id;
}

function normalSide(category: string) {
  return ["ASSET", "EXPENSE"].includes(category) ? "DEBIT" : "CREDIT";
}

function opposite(side: string) {
  return side === "DEBIT" ? "CREDIT" : "DEBIT";
}

/**
 * Reads the opening balance journal including archived rows: the scoped client hides
 * soft-deleted rows from every find, and a cleared opening balance still owns
 * the (companyId, sourceType, sourceId) slot we need to reuse.
 */
async function openingBalanceJournalId(
  tx: any,
  companyId: string,
  accountId: string,
) {
  const journal = await tx.manualJournal.findFirstIncludingDeleted({
    where: { companyId, sourceType: OPENING_BALANCE_SOURCE, sourceId: accountId }, select: { id: true },
  });
  return journal?.id ?? null;
}

async function offsetAccount(tx: any, companyId: string) {
  const existing = await tx.accountingAccount.findFirst({
    where: { name: OPENING_BALANCE_OFFSET },
  });
  return (
    existing ??
    tx.accountingAccount.create({
      data: {
        companyId,
        name: OPENING_BALANCE_OFFSET,
        code: "2220",
        accountType: "OTHER_CURRENT_LIABILITY",
        category: "LIABILITY",
        isSystem: true,
      },
    })
  );
}

function openingBalanceInput(
  body: { openingBalance?: number | null; openingBalanceDate?: string | null },
  category: string,
) {
  if (body.openingBalance === undefined) return null;
  const amount = body.openingBalance ?? 0;
  if (!Number.isFinite(amount))
    throw badRequest("Opening balance must be a valid amount");
  if (amount && !openingBalanceCategories.has(category))
    throw badRequest(
      "Opening balances apply to asset, liability, and equity accounts only",
    );
  const date = body.openingBalanceDate
    ? new Date(body.openingBalanceDate)
    : new Date();
  if (Number.isNaN(date.getTime()))
    throw badRequest("Opening balance date is invalid");
  return { amount: Math.round(amount * 100) / 100, date };
}

/**
 * Balances are derived from published journal lines, so an opening balance is
 * stored as a system journal between the account and Opening Balance
 * Adjustments. A positive amount sits on the account's normal side.
 */
export async function syncOpeningBalance(
  tx: any,
  account: { id: string; companyId: string; name: string; category: string },
  amount: number,
  date: Date,
) {
  cents(amount);
  await assertAccountingDateUnlocked(account.companyId, date);
  const old = await tx.manualJournal.findFirst({ where: { sourceType: OPENING_BALANCE_SOURCE, sourceId: account.id } });
  if (old) await assertAccountingDateUnlocked(account.companyId, old.journalDate);
  const existingId = await openingBalanceJournalId(
    tx,
    account.companyId,
    account.id,
  );
  const value = Math.abs(amount);
  if (!value) {
    if (existingId) {
      await tx.manualJournalLine.deleteMany({
        where: { journalId: existingId },
      });
      await tx.manualJournal.updateMany({
        where: { id: existingId },
        data: { total: 0, deletedAt: new Date() },
      });
    }
    await tx.accountOpeningBalance.updateMany({ where: { accountId: account.id }, data: { amount: 0, deletedAt: new Date() } });
    return;
  }
  if (account.name === OPENING_BALANCE_OFFSET)
    throw badRequest(
      `"${OPENING_BALANCE_OFFSET}" carries the other side of every opening balance and cannot hold one of its own`,
    );
  const offset = await offsetAccount(tx, account.companyId);
  const side =
    amount > 0
      ? normalSide(account.category)
      : opposite(normalSide(account.category));
  const lines = [
    {
      companyId: account.companyId,
      accountId: account.id,
      side,
      amount: value,
      description: "Opening balance",
    },
    {
      companyId: account.companyId,
      accountId: offset.id,
      side: opposite(side),
      amount: value,
      description: `Opening balance — ${account.name}`,
    },
  ];
  const company = await prisma.company.findUnique({ where: { id: account.companyId } });
  const journal = {
    currency: company.currency,
    exchangeRate: 1,
    journalDate: date,
    referenceNumber: "Opening Balance",
    notes: `Opening balance for ${account.name}`,
    status: "PUBLISHED" as const,
    publishedAt: new Date(),
    isSystemGenerated: true,
    total: value,
    deletedAt: null,
  };
  if (existingId) {
    await tx.manualJournalLine.deleteMany({ where: { journalId: existingId } });
    await tx.manualJournal.updateMany({
      where: { id: existingId },
      data: journal,
    });
    await tx.manualJournalLine.createMany({
      data: lines.map((line) => ({ ...line, journalId: existingId })),
    });
    await tx.accountOpeningBalance.upsert({
      where: { companyId_accountId: { companyId: account.companyId, accountId: account.id } },
      create: { companyId: account.companyId, accountId: account.id, asOfDate: date, side, amount: value, journalId: existingId, currency: company.currency },
      update: { asOfDate: date, side, amount: value, journalId: existingId, currency: company.currency, exchangeRate: 1, deletedAt: null },
    });
    return;
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`manual-journal:${account.companyId}`}))`;
  const count = await tx.manualJournal.count({ where: { companyId: account.companyId } });
  const created = await tx.manualJournal.create({
    data: {
      ...journal,
      companyId: account.companyId,
      entryNumber: `SYS-${String(count + 1).padStart(6, "0")}`,
      sourceType: OPENING_BALANCE_SOURCE,
      sourceId: account.id,
      lines: { create: lines },
    },
  });
  await tx.accountOpeningBalance.upsert({
    where: { companyId_accountId: { companyId: account.companyId, accountId: account.id } },
    create: { companyId: account.companyId, accountId: account.id, asOfDate: date, side, amount: value, journalId: created.id, currency: company.currency },
    update: { asOfDate: date, side, amount: value, journalId: created.id, currency: company.currency, exchangeRate: 1, deletedAt: null },
  });
}

async function openingBalancesFor(
  accounts: Array<{ id: string; category: string }>,
) {
  const categoryById = new Map(accounts.map((row) => [row.id, row.category]));
  const journals = await prisma.manualJournal.findMany({
    where: { sourceType: OPENING_BALANCE_SOURCE },
    select: {
      sourceId: true,
      journalDate: true,
      lines: {
        where: { deletedAt: null },
        select: { accountId: true, side: true, amount: true },
      },
    },
  });
  const openings = new Map<string, { amount: number; date: Date }>();
  for (const journal of journals) {
    const accountId = journal.sourceId;
    const category = accountId ? categoryById.get(accountId) : undefined;
    const line = journal.lines.find((row) => row.accountId === accountId);
    if (!accountId || !category || !line) continue;
    const amount = Number(line.amount);
    openings.set(accountId, {
      amount: line.side === normalSide(category) ? amount : -amount,
      date: journal.journalDate,
    });
  }
  return openings;
}

accountingAccountRouter.get(
  "/",
  rbac("ACCOUNT", "READ"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!;
    await ensureDefaults(companyId);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    const query = z
      .object({
        search: z.string().trim().optional(),
        category: z
          .enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"])
          .optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      })
      .parse(req.query);
    const data = await prisma.accountingAccount.findMany({
      where: {
        ...(query.category ? { category: query.category } : {}),
        ...(query.status ? { isActive: query.status === "ACTIVE" } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { code: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { children: true } } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    const [lineTotals, openings] = await Promise.all([
      baseCurrencyTotals({
        by: ["accountId", "side"],
        where: {
          deletedAt: null,
          journal: { status: "PUBLISHED", deletedAt: null },
        },
        _sum: { amount: true },
      }),
      openingBalancesFor(data),
    ]);
    const movements = new Map<string, { debit: number; credit: number }>();
    for (const line of lineTotals) {
      const current = movements.get(line.accountId) ?? { debit: 0, credit: 0 };
      current[line.side === "DEBIT" ? "debit" : "credit"] += Number(
        line._sum.amount ?? 0,
      );
      movements.set(line.accountId, current);
    }
    res.json({
      baseCurrency: company.currency,
      data: data.map((row) => {
        const movement = movements.get(row.id) ?? { debit: 0, credit: 0 };
        const balance = ["ASSET", "EXPENSE"].includes(row.category)
          ? movement.debit - movement.credit
          : movement.credit - movement.debit;
        const opening = openings.get(row.id);
        return {
          ...row,
          debitTotal: movement.debit,
          creditTotal: movement.credit,
          balance,
          openingBalance: opening?.amount ?? null,
          openingBalanceDate: opening?.date ?? null,
        };
      }),
    });
  }),
);

accountingAccountRouter.get(
  "/:id/ledger",
  rbac("ACCOUNT", "READ"),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const query = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(req.query);
    const account = await prisma.accountingAccount.findFirst({ where: { id } });
    if (!account) throw notFound("Account");
    const where: any = {
      accountId: id,
      deletedAt: null,
      journal: {
        status: "PUBLISHED",
        deletedAt: null,
        ...(query.from || query.to
          ? {
              journalDate: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to
                  ? { lte: new Date(`${query.to}T23:59:59.999Z`) }
                  : {}),
              },
            }
          : {}),
      },
    };
    const company = await prisma.company.findUnique({ where: { id: account.companyId } });
    const skip = (query.page - 1) * query.pageSize;
    const [lines, total, totals, newerLines] = await Promise.all([
      prisma.manualJournalLine.findMany({
        where,
        include: {
          journal: {
            select: {
              id: true,
              entryNumber: true,
              journalDate: true,
              referenceNumber: true,
              notes: true,
              sourceType: true,
              sourceId: true,
              currency: true,
              exchangeRate: true,
            },
          },
        },
        orderBy: [{ journal: { journalDate: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
        skip,
        take: query.pageSize,
      }),
      prisma.manualJournalLine.count({ where }),
      baseCurrencyTotals({
        by: ["side"],
        where: { ...where, journal: { ...where.journal, journalDate: query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : undefined } },
        _sum: { amount: true },
      }),
      skip
        ? prisma.manualJournalLine.findMany({
            where,
            select: { side: true, amount: true, journal: { select: { exchangeRate: true } } },
            orderBy: [
              { journal: { journalDate: "desc" } },
              { createdAt: "desc" }, { id: "desc" },
            ],
            take: skip,
          })
        : Promise.resolve([]),
    ]);
    const partyIds = [
      ...new Set(lines.map((line) => line.partyId).filter(Boolean)),
    ] as string[];
    const parties = partyIds.length
      ? await prisma.party.findMany({
          where: { id: { in: partyIds } },
          select: { id: true, name: true },
        })
      : [];
    const partyMap = new Map(parties.map((party) => [party.id, party.name]));
    const typeLabels: Record<string, string> = {
      MONEY_RECEIVE: "Receipt", MONEY_PAY: "Payment", MONEY_REVERSAL: "Payment reversal",
      SALES_INVOICE: "Invoice",
      SALES_PAYMENT: "Invoice Payment",
      ADVANCE_PAYMENT: "Retainer Payment",
      ADVANCE_APPLICATION: "Retainer Applied",
      ACCOUNT_TRANSFER: "Account Transfer",
      OPENING_BALANCE: "Opening Balance",
    };
    const debitTotal = Number(
      totals.find((row) => row.side === "DEBIT")?._sum.amount ?? 0,
    );
    const creditTotal = Number(
      totals.find((row) => row.side === "CREDIT")?._sum.amount ?? 0,
    );
    const debitNormal = ["ASSET", "EXPENSE"].includes(account.category);
    const signedBalance = debitNormal
      ? debitTotal - creditTotal
      : creditTotal - debitTotal;
    const signedMovement = (side: string, amount: unknown) => {
      const value = Number(amount);
      return debitNormal
        ? side === "DEBIT"
          ? value
          : -value
        : side === "CREDIT"
          ? value
          : -value;
    };
    let runningBalance =
      signedBalance -
      newerLines.reduce(
        (sum, line) => sum + signedMovement(line.side, baseAmount(line)),
        0,
      );
    const data = lines.map((line) => {
      const balance = runningBalance;
      runningBalance -= signedMovement(line.side, baseAmount(line));
      return {
        id: line.id,
        sourceParties: line.sourceParties,
        date: line.journal.journalDate,
        transactionDetails: line.partyId
          ? (partyMap.get(line.partyId) ?? line.journal.notes)
          : line.journal.notes,
        type: line.journal.sourceType
          ? (typeLabels[line.journal.sourceType] ??
            line.journal.sourceType.replaceAll("_", " "))
          : "Manual Journal",
        referenceNumber: line.journal.referenceNumber,
        journalNumber: line.journal.entryNumber,
        debit: line.side === "DEBIT" ? baseAmount(line) : 0,
        credit: line.side === "CREDIT" ? baseAmount(line) : 0,
        balance: Math.abs(balance),
        balanceSide:
          balance === 0
            ? debitNormal
              ? "DR"
              : "CR"
            : balance > 0
              ? debitNormal
                ? "DR"
                : "CR"
              : debitNormal
                ? "CR"
                : "DR",
        currency: company.currency,
        originalCurrency: line.journal.currency, originalAmount: Number(line.amount),
        exchangeRate: Number(line.journal.exchangeRate),
      };
    });
    res.json({
      account: {
        id: account.id,
        name: account.name,
        category: account.category,
        accountType: account.accountType,
        currency: company.currency,
      },
      closingBalance: Math.abs(signedBalance),
      balanceSide:
        signedBalance === 0
          ? debitNormal
            ? "DR"
            : "CR"
          : signedBalance > 0
            ? debitNormal
              ? "DR"
              : "CR"
            : debitNormal
              ? "CR"
              : "DR",
      debitTotal,
      creditTotal,
      total,
      data,
    });
  }),
);

accountingAccountRouter.post(
  "/",
  rbac("ACCOUNT", "CREATE"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId!;
    const { openingBalance, openingBalanceDate, ...body } = accountSchema.parse(
      req.body,
    );
    const parentId = await validateParent(body.parentId, body.accountType);
    const category = categories[body.accountType];
    const opening = openingBalanceInput(
      { openingBalance, openingBalanceDate },
      category,
    );
    if (opening?.amount)
      await assertAccountingDateUnlocked(companyId, opening.date);
    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.accountingAccount.create({
        data: {
          ...body,
          companyId,
          code: body.code || null,
          parentId,
          category,
          bankName: body.bankName || null,
          accountNumber: body.accountNumber || null,
          routingNumber: body.routingNumber || null,
        },
      });
      if (opening)
        await syncOpeningBalance(tx, created, opening.amount, opening.date);
      return created;
    });
    await logActivity({
      companyId: account.companyId,
      userId: req.user!.userId,
      action: "created",
      resource: "account",
      resourceId: account.id,
      meta: { name: account.name, type: account.accountType },
    });
    res.status(201).json(account);
  }),
);

accountingAccountRouter.patch(
  "/:id",
  rbac("ACCOUNT", "UPDATE"),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.accountingAccount.findFirst({
      where: { id },
    });
    if (!existing) throw notFound("Account");
    const { openingBalance, openingBalanceDate, ...body } = accountSchema
      .partial()
      .parse(req.body);
    if (existing.isSystem && ((body.accountType && body.accountType !== existing.accountType) ||
      (body.parentId !== undefined && body.parentId !== existing.parentId) || (body.name && body.name !== existing.name))) {
      throw badRequest("System account type and hierarchy cannot be changed");
    }
    const accountType = body.accountType ?? existing.accountType;
    if (accountType !== existing.accountType && await prisma.manualJournalLine.count({ where: { accountId: id, deletedAt: null } })) {
      throw badRequest('An account with journal entries cannot change type');
    }
    const category = categories[accountType];
    const parentId =
      body.parentId !== undefined
        ? await validateParent(body.parentId, accountType, id)
        : existing.parentId;
    const opening = openingBalanceInput(
      { openingBalance, openingBalanceDate },
      category,
    );
    if (opening?.amount)
      await assertAccountingDateUnlocked(existing.companyId, opening.date);
    const account = await prisma.$transaction(async (tx) => {
      const updated = await tx.accountingAccount.update({
        where: { id },
        data: {
          ...body,
          ...(body.code !== undefined ? { code: body.code || null } : {}),
          parentId,
          category,
        },
      });
      if (opening)
        await syncOpeningBalance(tx, updated, opening.amount, opening.date);
      return updated;
    });
    await logActivity({
      companyId: account.companyId,
      userId: req.user!.userId,
      action: "updated",
      resource: "account",
      resourceId: account.id,
      meta: { name: account.name },
    });
    res.json(account);
  }),
);

accountingAccountRouter.post(
  "/:id/status",
  rbac("ACCOUNT", "UPDATE"),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const body = z.object({ isActive: z.boolean() }).parse(req.body);
    const existing = await prisma.accountingAccount.findFirst({
      where: { id },
    });
    if (!existing) throw notFound("Account");
    if (existing.isSystem && !body.isActive)
      throw badRequest("System accounts cannot be marked inactive");
    if (
      !body.isActive &&
      (await prisma.accountingAccount.count({
        where: { parentId: id, isActive: true },
      }))
    ) {
      throw badRequest("Mark active sub-accounts inactive first");
    }
    const account = await prisma.accountingAccount.update({
      where: { id },
      data: body,
    });
    await logActivity({
      companyId: account.companyId,
      userId: req.user!.userId,
      action: body.isActive ? "marked active" : "marked inactive",
      resource: "account",
      resourceId: id,
      meta: { name: account.name },
    });
    res.json(account);
  }),
);

accountingAccountRouter.delete(
  "/:id",
  rbac("ACCOUNT", "DELETE"),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.accountingAccount.findFirst({
      where: { id },
    });
    if (!existing) throw notFound("Account");
    if (existing.isSystem)
      throw badRequest("System accounts cannot be deleted");
    if (await prisma.manualJournalLine.count({ where: { accountId: id, deletedAt: null } }))
      throw badRequest('Accounts with journal entries cannot be deleted; mark them inactive instead');
    if (await prisma.accountingAccount.count({ where: { parentId: id } }))
      throw badRequest("Delete or move sub-accounts first");
    await prisma.$transaction(async (tx) => {
      await syncOpeningBalance(tx, existing, 0, new Date());
      await tx.accountingAccount.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
    await logActivity({
      companyId: existing.companyId,
      userId: req.user!.userId,
      action: "deleted",
      resource: "account",
      resourceId: id,
      meta: { name: existing.name },
    });
    res.json({ ok: true });
  }),
);
