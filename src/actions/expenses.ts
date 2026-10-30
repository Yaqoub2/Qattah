"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { getMembership, refreshGroupBalances } from "@/lib/balances";
import { isAdminRole } from "@/lib/quota";
import {
  computeExpenseSplits,
  consumePaymentSurplus,
  leftover,
  planMerchantFunding,
  wasMemberAt,
  type SplitMethod as LedgerSplit,
} from "@/lib/ledger";
import { parseMajorInput } from "@/lib/money";
import { fileFromForm, uploadPublicFile } from "@/lib/storage";
import type { ApprovalStatus, Prisma, SplitMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function parseJsonArray<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function shareRows(
  lines: { userId: string; dueAmount: number; baselineAmount: number }[],
  shareSpecs: {
    userId: string;
    shareWeight: number;
    percentage: number | null;
    amountOverride: number | null;
  }[],
) {
  return lines.map((line) => {
    const spec = shareSpecs.find((s) => s.userId === line.userId)!;
    return {
      userId: line.userId,
      included: true,
      shareWeight: spec.shareWeight,
      percentage: spec.percentage,
      amountOverride: spec.amountOverride,
      dueAmount: line.dueAmount,
      baselineAmount: line.baselineAmount,
    };
  });
}

async function plannedBudgetDraws(
  db: Prisma.TransactionClient | typeof prisma,
  opts: {
    groupId: string;
    expenseId?: string;
    expenseLeftover: number;
    merchantPaymentIds: Set<string>;
  },
) {
  if (opts.expenseLeftover <= 0) return [];
  const payments = await db.payment.findMany({
    where: { groupId: opts.groupId, approvalStatus: "approved" },
    include: { allocations: true },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
  });
  const pool = payments.map((p) => {
    const used = p.allocations
      .filter((a) => {
        if (opts.expenseId && a.expenseId === opts.expenseId && !opts.merchantPaymentIds.has(a.paymentId)) {
          return false;
        }
        return true;
      })
      .reduce((s, a) => s + a.amount, 0);
    return { paymentId: p.id, leftover: leftover(p.amount, used) };
  });
  return consumePaymentSurplus({
    expenseLeftover: opts.expenseLeftover,
    payments: pool.filter((p) => p.leftover > 0),
  });
}

async function persistFunding(
  tx: Prisma.TransactionClient,
  opts: {
    groupId: string;
    expenseId: string;
    merchant: { userId: string; paymentAmount: number; allocated: number }[];
    draws: { paymentId: string; amount: number }[];
    fromBudget: boolean;
    approvalStatus: ApprovalStatus;
  },
) {
  const existing = await tx.expensePayer.findMany({ where: { expenseId: opts.expenseId } });
  const existingByUser = new Map(existing.map((p) => [p.userId, p]));
  const keepUsers = new Set(opts.merchant.map((m) => m.userId));

  for (const row of existing) {
    if (keepUsers.has(row.userId)) continue;
    if (row.paymentId) {
      await tx.paymentAllocation.deleteMany({
        where: { paymentId: row.paymentId, expenseId: opts.expenseId },
      });
      const remaining = await tx.paymentAllocation.count({ where: { paymentId: row.paymentId } });
      await tx.expensePayer.delete({ where: { id: row.id } });
      if (remaining === 0) {
        const linked = await tx.expensePayer.count({ where: { paymentId: row.paymentId } });
        if (linked === 0) {
          await tx.payment.delete({ where: { id: row.paymentId } });
        }
      }
    } else {
      await tx.expensePayer.delete({ where: { id: row.id } });
    }
  }

  const merchantPaymentIds = new Set<string>();
  for (const m of opts.merchant) {
    const prev = existingByUser.get(m.userId);
    let paymentId = prev?.paymentId ?? null;
    if (paymentId) {
      await tx.payment.update({
        where: { id: paymentId },
        data: { amount: m.paymentAmount, approvalStatus: opts.approvalStatus },
      });
      await tx.paymentAllocation.deleteMany({
        where: { paymentId, expenseId: opts.expenseId },
      });
      if (m.allocated > 0) {
        await tx.paymentAllocation.create({
          data: { paymentId, expenseId: opts.expenseId, amount: m.allocated },
        });
      }
      if (m.allocated > 0) {
        await tx.expensePayer.update({
          where: { id: prev!.id },
          data: { amount: m.allocated, paymentId },
        });
      } else if (prev) {
        await tx.expensePayer.delete({ where: { id: prev.id } });
      }
    } else {
      const payment = await tx.payment.create({
        data: {
          groupId: opts.groupId,
          payerUserId: m.userId,
          amount: m.paymentAmount,
          approvalStatus: opts.approvalStatus,
          allocations:
            m.allocated > 0
              ? { create: [{ expenseId: opts.expenseId, amount: m.allocated }] }
              : undefined,
        },
      });
      paymentId = payment.id;
      if (prev && m.allocated > 0) {
        await tx.expensePayer.update({
          where: { id: prev.id },
          data: { amount: m.allocated, paymentId },
        });
      } else if (m.allocated > 0) {
        await tx.expensePayer.create({
          data: {
            expenseId: opts.expenseId,
            userId: m.userId,
            amount: m.allocated,
            paymentId,
          },
        });
      }
    }
    if (paymentId) merchantPaymentIds.add(paymentId);
  }

  const allocs = await tx.paymentAllocation.findMany({
    where: { expenseId: opts.expenseId },
    select: { id: true, paymentId: true },
  });
  const staleAllocIds = allocs.filter((a) => !merchantPaymentIds.has(a.paymentId)).map((a) => a.id);
  if (staleAllocIds.length > 0) {
    await tx.paymentAllocation.deleteMany({ where: { id: { in: staleAllocIds } } });
  }

  let budgetPaidAmount = 0;
  if (opts.fromBudget && opts.draws.length > 0) {
    await tx.paymentAllocation.createMany({
      data: opts.draws.map((d) => ({
        paymentId: d.paymentId,
        expenseId: opts.expenseId,
        amount: d.amount,
      })),
    });
    budgetPaidAmount = opts.draws.reduce((s, d) => s + d.amount, 0);
  }

  await tx.expense.update({
    where: { id: opts.expenseId },
    data: { budgetPaidAmount },
  });
  return budgetPaidAmount;
}

async function prepareExpenseWrite(
  formData: FormData,
  opts: {
    groupId: string;
    currency: string;
    defaultSplit: SplitMethod;
    at: Date;
    expenseId?: string;
    existingMerchantPaymentIds?: Set<string>;
  },
) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false as const, error: "title_required" };
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const amount = parseMajorInput(String(formData.get("amount") ?? ""), opts.currency);
  if (amount === null || amount <= 0) return { ok: false as const, error: "invalid_amount" };

  const splitMethod = (String(formData.get("splitMethod") ?? opts.defaultSplit) as SplitMethod);
  const isSealed = String(formData.get("isSealed") ?? "") === "on";
  const fromBudget = String(formData.get("fromBudget") ?? "") === "on";

  const members = await prisma.groupMember.findMany({
    where: { groupId: opts.groupId },
    include: { user: true },
  });
  const eligible = members.filter((mem) => wasMemberAt(mem.invitedAt, opts.at));

  const includedIds = parseJsonArray<string[]>(
    String(formData.get("includedIds") ?? "[]"),
    eligible.map((x) => x.userId),
  ).filter((id) => eligible.some((m) => m.userId === id));
  const shareWeights = parseJsonArray<Record<string, number>>(String(formData.get("shareWeights") ?? "{}"), {});
  const percentages = parseJsonArray<Record<string, number>>(String(formData.get("percentages") ?? "{}"), {});
  const amountOverrides = parseJsonArray<Record<string, number>>(String(formData.get("amountOverrides") ?? "{}"), {});
  const payersIn = parseJsonArray<{ userId: string; amount: number }[]>(String(formData.get("payers") ?? "[]"), []);

  const shareSpecs = eligible.map((mem) => ({
    userId: mem.userId,
    included: includedIds.includes(mem.userId),
    shareWeight: shareWeights[mem.userId] ?? mem.defaultShare,
    percentage: percentages[mem.userId] ?? (mem.defaultPercentage ? Number(mem.defaultPercentage) : null),
    amountOverride:
      amountOverrides[mem.userId] !== undefined ? amountOverrides[mem.userId] : mem.defaultAmount,
  }));

  const memberWeights = eligible.map((mem) => ({
    userId: mem.userId,
    isPayingUser: mem.isPayingUser,
    share: mem.defaultShare,
    percentage: mem.defaultPercentage ? Number(mem.defaultPercentage) : null,
    amount: mem.defaultAmount,
  }));

  const merchant = planMerchantFunding(
    amount,
    payersIn.filter((p) => p.amount > 0),
  );
  const merchantAllocated = merchant.reduce((s, m) => s + m.allocated, 0);

  let budgetPaidAmount = 0;
  let draws: { paymentId: string; amount: number }[] = [];
  if (fromBudget) {
    draws = await plannedBudgetDraws(prisma, {
      groupId: opts.groupId,
      expenseId: opts.expenseId,
      expenseLeftover: leftover(amount, merchantAllocated),
      merchantPaymentIds: opts.existingMerchantPaymentIds ?? new Set(),
    });
    budgetPaidAmount = draws.reduce((s, d) => s + d.amount, 0);
  }

  const lines = computeExpenseSplits({
    amount,
    dueMethod: splitMethod as LedgerSplit,
    baselineMethod: opts.defaultSplit as LedgerSplit,
    members: memberWeights,
    shares: shareSpecs,
    budgetPaidAmount,
  });

  return {
    ok: true as const,
    title,
    notes,
    amount,
    splitMethod,
    isSealed,
    fromBudget,
    lines,
    shareSpecs,
    merchant,
    budgetPaidAmount,
    draws,
    memberWeights,
  };
}

async function maybeReceipt(formData: FormData, groupId: string, current?: string | null) {
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    const { bytes, contentType } = await fileFromForm(file);
    return uploadPublicFile({
      path: `receipts/${groupId}/${crypto.randomUUID()}-${file.name}`,
      bytes,
      contentType,
    });
  }
  return current ?? null;
}

export async function createExpense(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const activityId = String(formData.get("activityId") ?? "");
  const m = await getMembership(groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };

  const activity = await prisma.activity.findFirst({ where: { id: activityId, groupId } });
  if (!activity) return { ok: false, error: "not_found" };
  if (activity.status === "closed") return { ok: false, error: "activity_closed" };

  const isAdmin = isAdminRole(m.role);
  if (!isAdmin && !m.group.membersCanSubmit) return { ok: false, error: "forbidden" };

  const prepared = await prepareExpenseWrite(formData, {
    groupId,
    currency: m.group.currency,
    defaultSplit: m.group.defaultSplitMethod,
    at: new Date(),
  });
  if (!prepared.ok) return prepared;

  const receiptUrl = await maybeReceipt(formData, groupId);
  const approvalStatus: ApprovalStatus = isAdmin ? "approved" : "pending";
  const shareCreate = shareRows(prepared.lines, prepared.shareSpecs);
  const needsFunding = prepared.merchant.length > 0 || prepared.draws.length > 0;

  const expense = needsFunding
    ? await prisma.$transaction(
        async (tx) => {
          const created = await tx.expense.create({
            data: {
              activityId,
              groupId,
              title: prepared.title,
              notes: prepared.notes,
              receiptUrl,
              amount: prepared.amount,
              splitMethod: prepared.splitMethod,
              approvalStatus,
              isSealed: prepared.isSealed,
              budgetPaidAmount: prepared.budgetPaidAmount,
              createdById: user.id,
              shares: { create: shareCreate },
            },
          });
          await persistFunding(tx, {
            groupId,
            expenseId: created.id,
            merchant: prepared.merchant,
            draws: prepared.draws,
            fromBudget: prepared.fromBudget,
            approvalStatus,
          });
          return created;
        },
        { timeout: 20_000, maxWait: 10_000 },
      )
    : await prisma.expense.create({
        data: {
          activityId,
          groupId,
          title: prepared.title,
          notes: prepared.notes,
          receiptUrl,
          amount: prepared.amount,
          splitMethod: prepared.splitMethod,
          approvalStatus,
          isSealed: prepared.isSealed,
          budgetPaidAmount: 0,
          createdById: user.id,
          shares: { create: shareCreate },
        },
      });

  await audit({
    groupId,
    actorUserId: user.id,
    action: isAdmin ? "expense.create" : "expense.submit",
    entityType: "expense",
    entityId: expense.id,
    metadata: { title: prepared.title, amount: prepared.amount, pending: !isAdmin, isSealed: prepared.isSealed },
  });

  await refreshGroupBalances(groupId);
  revalidatePath(`/groups/${groupId}`);
  return { ok: true, id: expense.id };
}

export async function updateExpense(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const expenseId = String(formData.get("expenseId") ?? "");
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { activity: true, payers: true, shares: true },
  });
  if (!expense) return { ok: false, error: "not_found" };
  const m = await getMembership(expense.groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };
  const isAdmin = isAdminRole(m.role);
  if (!isAdmin && expense.createdById !== user.id) return { ok: false, error: "forbidden" };
  if (expense.activity.status === "closed") return { ok: false, error: "activity_closed" };

  const prepared = await prepareExpenseWrite(formData, {
    groupId: expense.groupId,
    currency: m.group.currency,
    defaultSplit: m.group.defaultSplitMethod,
    at: expense.createdAt,
    expenseId,
    existingMerchantPaymentIds: new Set(expense.payers.map((p) => p.paymentId).filter((id): id is string => Boolean(id))),
  });
  if (!prepared.ok) return prepared;

  const amount = expense.isSealed ? expense.amount : prepared.amount;
  if (expense.isSealed && prepared.amount !== expense.amount) {
    return { ok: false, error: "sealed" };
  }
  const isSealed = expense.isSealed || prepared.isSealed;
  const receiptUrl = await maybeReceipt(formData, expense.groupId, expense.receiptUrl);

  await prisma.$transaction(
    async (tx) => {
    const budgetPaidAmount = await persistFunding(tx, {
      groupId: expense.groupId,
      expenseId,
      merchant: prepared.merchant,
      draws: prepared.draws,
      fromBudget: prepared.fromBudget,
      approvalStatus: expense.approvalStatus,
    });
    const lines = computeExpenseSplits({
      amount,
      dueMethod: (expense.isSealed ? expense.splitMethod : prepared.splitMethod) as LedgerSplit,
      baselineMethod: m.group.defaultSplitMethod as LedgerSplit,
      members: prepared.memberWeights,
      shares: prepared.shareSpecs,
      budgetPaidAmount,
    });
    if (!expense.isSealed) {
      await tx.expenseShare.deleteMany({ where: { expenseId } });
    }
    await tx.expense.update({
      where: { id: expenseId },
      data: {
        title: prepared.title,
        notes: prepared.notes,
        receiptUrl,
        amount,
        splitMethod: expense.isSealed ? expense.splitMethod : prepared.splitMethod,
        isSealed,
        ...(!expense.isSealed
          ? { shares: { create: shareRows(lines, prepared.shareSpecs) } }
          : {}),
      },
    });
    if (expense.isSealed) {
      for (const line of lines) {
        await tx.expenseShare.updateMany({
          where: { expenseId, userId: line.userId },
          data: { baselineAmount: line.baselineAmount },
        });
      }
    }
  },
    { timeout: 20_000, maxWait: 10_000 },
  );

  await audit({
    groupId: expense.groupId,
    actorUserId: user.id,
    action: "expense.update",
    entityType: "expense",
    entityId: expenseId,
    metadata: { amount, isSealed },
  });
  await refreshGroupBalances(expense.groupId);
  revalidatePath(`/groups/${expense.groupId}`);
  return { ok: true, id: expenseId };
}

export async function setExpenseApproval(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const expenseId = String(formData.get("expenseId") ?? "");
  const status = String(formData.get("status") ?? "") as "approved" | "rejected";
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { payers: true },
  });
  if (!expense) return { ok: false, error: "not_found" };
  const m = await getMembership(expense.groupId, user.id);
  if (!m || !isAdminRole(m.role)) return { ok: false, error: "forbidden" };

  const paymentIds = expense.payers.map((p) => p.paymentId).filter((id): id is string => Boolean(id));
  await prisma.$transaction([
    prisma.expense.update({
      where: { id: expenseId },
      data: { approvalStatus: status },
    }),
    ...paymentIds.map((id) =>
      prisma.payment.update({
        where: { id },
        data: { approvalStatus: status },
      }),
    ),
  ]);
  await audit({
    groupId: expense.groupId,
    actorUserId: user.id,
    action: `expense.${status}`,
    entityType: "expense",
    entityId: expenseId,
  });
  await refreshGroupBalances(expense.groupId);
  revalidatePath(`/groups/${expense.groupId}`);
  return { ok: true, id: expenseId };
}

export async function deleteExpense(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const expenseId = String(formData.get("expenseId") ?? "");
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { payers: true, allocations: true },
  });
  if (!expense) return { ok: false, error: "not_found" };
  const m = await getMembership(expense.groupId, user.id);
  if (!m || !isAdminRole(m.role)) return { ok: false, error: "forbidden" };
  if (expense.isSealed) return { ok: false, error: "sealed" };

  const merchantPaymentIds = expense.payers.map((p) => p.paymentId).filter((id): id is string => Boolean(id));
  await prisma.$transaction(async (tx) => {
    await tx.expense.delete({ where: { id: expenseId } });
    for (const paymentId of merchantPaymentIds) {
      const remaining = await tx.paymentAllocation.count({ where: { paymentId } });
      if (remaining === 0) {
        await tx.payment.delete({ where: { id: paymentId } }).catch(() => undefined);
      }
    }
  });
  await audit({
    groupId: expense.groupId,
    actorUserId: user.id,
    action: "expense.delete",
    entityType: "expense",
    entityId: expenseId,
  });
  await refreshGroupBalances(expense.groupId);
  revalidatePath(`/groups/${expense.groupId}`);
  return { ok: true, id: expenseId };
}

/** FIFO-allocate unallocated approved payments onto an existing expense. Not a new contribution. */
export async function payExpenseFromBudget(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const expenseId = String(formData.get("expenseId") ?? "");
  if (!expenseId) return { ok: false, error: "allocate_required" };

  const m = await getMembership(groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };
  const isAdmin = isAdminRole(m.role);
  if (!isAdmin && !m.group.membersCanSubmit) return { ok: false, error: "forbidden" };

  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, groupId },
    include: { shares: true, allocations: true, activity: true },
  });
  if (!expense) return { ok: false, error: "not_found" };
  if (expense.approvalStatus !== "approved") return { ok: false, error: "forbidden" };
  if (expense.activity.status === "closed") return { ok: false, error: "activity_closed" };

  const collected = expense.allocations.reduce((s, a) => s + a.amount, 0);
  const expenseLeftover = leftover(expense.amount, collected);
  if (expenseLeftover <= 0) return { ok: true, id: expenseId };

  const draws = await plannedBudgetDraws(prisma, {
    groupId,
    expenseLeftover,
    merchantPaymentIds: new Set(),
  });
  if (draws.length === 0) return { ok: false, error: "budget_insufficient" };

  const drawn = draws.reduce((s, d) => s + d.amount, 0);
  const budgetPaidAmount = expense.budgetPaidAmount + drawn;

  const members = await prisma.groupMember.findMany({ where: { groupId } });
  const eligible = members.filter((mem) => wasMemberAt(mem.invitedAt, expense.createdAt));
  const shareSpecs = expense.shares.map((s) => ({
    userId: s.userId,
    included: s.included,
    shareWeight: s.shareWeight,
    percentage: s.percentage != null ? Number(s.percentage) : null,
    amountOverride: s.amountOverride,
  }));
  const memberWeights = eligible.map((mem) => ({
    userId: mem.userId,
    isPayingUser: mem.isPayingUser,
    share: mem.defaultShare,
    percentage: mem.defaultPercentage ? Number(mem.defaultPercentage) : null,
    amount: mem.defaultAmount,
  }));
  const lines = computeExpenseSplits({
    amount: expense.amount,
    dueMethod: expense.splitMethod as LedgerSplit,
    baselineMethod: m.group.defaultSplitMethod as LedgerSplit,
    members: memberWeights,
    shares: shareSpecs,
    budgetPaidAmount,
  });

  await prisma.$transaction([
    prisma.paymentAllocation.createMany({
      data: draws.map((d) => ({
        paymentId: d.paymentId,
        expenseId,
        amount: d.amount,
      })),
    }),
    prisma.expense.update({
      where: { id: expenseId },
      data: { budgetPaidAmount },
    }),
    ...lines.map((line) =>
      prisma.expenseShare.updateMany({
        where: { expenseId, userId: line.userId },
        data: { baselineAmount: line.baselineAmount },
      }),
    ),
  ]);

  await audit({
    groupId,
    actorUserId: user.id,
    action: "expense.budget_draw",
    entityType: "expense",
    entityId: expenseId,
    metadata: { amount: drawn },
  });
  await refreshGroupBalances(groupId);
  revalidatePath(`/groups/${groupId}`);
  return { ok: true, id: expenseId };
}
