import { prisma } from "./db";
import {
  collectedOf,
  displayedBaseline,
  groupBudgetSurplus,
  memberDueTotals,
  wasMemberAt,
} from "./ledger";

export type MemberLedgerTotals = {
  dueAmount: number;
  paidAmount: number;
  netAmount: number;
  baselineAmount: number;
};

export type GroupLedger = {
  byUser: Record<string, MemberLedgerTotals>;
  budgetAmount: number;
};

export const emptyMemberLedger = (): MemberLedgerTotals => ({
  dueAmount: 0,
  paidAmount: 0,
  netAmount: 0,
  baselineAmount: 0,
});

export function attachMemberLedger<T extends { userId: string }>(
  row: T,
  ledger: GroupLedger,
): T & MemberLedgerTotals {
  return { ...row, ...(ledger.byUser[row.userId] ?? emptyMemberLedger()) };
}

/** Batched reads only — no per-row queries. */
export async function computeGroupLedger(groupId: string): Promise<GroupLedger> {
  const [members, expenses, payments] = await Promise.all([
    prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true, invitedAt: true },
    }),
    prisma.expense.findMany({
      where: { groupId, approvalStatus: "approved" },
      select: { id: true, amount: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { groupId, approvalStatus: "approved" },
      select: { id: true, amount: true, payerUserId: true, paidAt: true },
    }),
  ]);

  const expenseIds = expenses.map((e) => e.id);
  const paymentIds = payments.map((p) => p.id);
  const [shares, allocations] = await Promise.all([
    expenseIds.length
      ? prisma.expenseShare.findMany({
          where: { expenseId: { in: expenseIds } },
          select: {
            expenseId: true,
            userId: true,
            included: true,
            dueAmount: true,
            baselineAmount: true,
          },
        })
      : Promise.resolve([]),
    paymentIds.length
      ? prisma.paymentAllocation.findMany({
          where: { paymentId: { in: paymentIds } },
          select: { paymentId: true, expenseId: true, amount: true },
        })
      : Promise.resolve([]),
  ]);

  const sharesByExpense = new Map<string, typeof shares>();
  for (const s of shares) {
    const rows = sharesByExpense.get(s.expenseId) ?? [];
    rows.push(s);
    sharesByExpense.set(s.expenseId, rows);
  }

  const allocsByPayment = new Map<string, typeof allocations>();
  for (const a of allocations) {
    const rows = allocsByPayment.get(a.paymentId) ?? [];
    rows.push(a);
    allocsByPayment.set(a.paymentId, rows);
  }

  const paid: Record<string, number> = {};
  const baseline: Record<string, number> = {};
  const invitedAt = new Map(members.map((m) => [m.userId, m.invitedAt]));
  for (const m of members) {
    paid[m.userId] = 0;
    baseline[m.userId] = 0;
  }

  const allocationsByExpense = new Map<string, { amount: number; payerUserId: string }[]>();
  let paymentTotal = 0;
  for (const p of payments) {
    paymentTotal += p.amount;
    const joined = invitedAt.get(p.payerUserId);
    if (joined && wasMemberAt(joined, p.paidAt)) {
      paid[p.payerUserId] = (paid[p.payerUserId] ?? 0) + p.amount;
    }
    for (const a of allocsByPayment.get(p.id) ?? []) {
      const rows = allocationsByExpense.get(a.expenseId) ?? [];
      rows.push({ amount: a.amount, payerUserId: p.payerUserId });
      allocationsByExpense.set(a.expenseId, rows);
    }
  }

  const dues = memberDueTotals({
    members,
    expenses: expenses.map((e) => ({
      createdAt: e.createdAt,
      shares: sharesByExpense.get(e.id) ?? [],
      allocations: allocationsByExpense.get(e.id) ?? [],
    })),
  });

  for (const e of expenses) {
    const allocs = allocationsByExpense.get(e.id) ?? [];
    const collected = collectedOf({ allocations: allocs });
    for (const s of sharesByExpense.get(e.id) ?? []) {
      if (!s.included) continue;
      const joined = invitedAt.get(s.userId);
      if (!joined || !wasMemberAt(joined, e.createdAt)) continue;
      baseline[s.userId] =
        (baseline[s.userId] ?? 0) + displayedBaseline(s.baselineAmount, collected, e.amount);
    }
  }

  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const byUser: Record<string, MemberLedgerTotals> = {};
  for (const m of members) {
    const dueAmount = dues.remainingDue[m.userId] ?? 0;
    const paidAmount = paid[m.userId] ?? 0;
    const originalDue = dues.originalDue[m.userId] ?? 0;
    byUser[m.userId] = {
      dueAmount,
      paidAmount,
      netAmount: paidAmount - originalDue,
      baselineAmount: baseline[m.userId] ?? 0,
    };
  }

  return {
    byUser,
    budgetAmount: groupBudgetSurplus({ payments: paymentTotal, expenses: expenseTotal }),
  };
}
