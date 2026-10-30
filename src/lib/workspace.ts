import { prisma } from "@/lib/db";
import { leftover } from "@/lib/ledger";
import { attachMemberLedger, computeGroupLedger } from "@/lib/group-ledger";
import { forgetPrefix, forgetTag, remember } from "@/lib/memo-cache";
import type { ActivityCardData } from "@/lib/workspace-types";

export type { ActivityCardData };

const TTL = 90_000;

function toActivityCard(a: {
  id: string;
  title: string;
  status: "open" | "closed";
  expenses: { amount: number; allocations: { amount: number }[] }[];
}): ActivityCardData {
  const total = a.expenses.reduce((s, e) => s + e.amount, 0);
  const collected = a.expenses.reduce(
    (s, e) => s + e.allocations.reduce((n, x) => n + x.amount, 0),
    0,
  );
  return { id: a.id, title: a.title, status: a.status, total, collected };
}

const activityCardInclude = {
  expenses: {
    where: { approvalStatus: "approved" as const },
    select: {
      amount: true,
      allocations: { select: { amount: true } },
    },
  },
};

export async function getGroupLedgerCached(groupId: string) {
  return remember(`group:${groupId}:ledger`, [`group:${groupId}`], TTL, () => computeGroupLedger(groupId));
}

export async function getUserMemberships(userId: string) {
  return remember(`user:${userId}:memberships`, [`user:${userId}`], TTL, async () => {
    const rows = await prisma.groupMember.findMany({
      where: { userId },
      include: { group: true },
      orderBy: { invitedAt: "desc" },
    });
    const groupIds = [...new Set(rows.map((r) => r.groupId))];
    const ledgers = await Promise.all(groupIds.map((id) => getGroupLedgerCached(id)));
    const byGroup = new Map(groupIds.map((id, i) => [id, ledgers[i]]));
    return rows.map((row) => attachMemberLedger(row, byGroup.get(row.groupId)!));
  });
}

export async function getUserPaymentMethods(userId: string) {
  return remember(`user:${userId}:methods`, [`user:${userId}`], TTL, () =>
    prisma.userPaymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function getGroupMembers(groupId: string) {
  const [rows, ledger] = await Promise.all([
    remember(`group:${groupId}:members`, [`group:${groupId}`], TTL, () =>
      prisma.groupMember.findMany({
        where: { groupId },
        include: { user: true },
        orderBy: { invitedAt: "asc" },
      }),
    ),
    getGroupLedgerCached(groupId),
  ]);
  return rows.map((row) => attachMemberLedger(row, ledger));
}

export async function getGroupMembership(groupId: string, userId: string) {
  return remember(`group:${groupId}:membership:${userId}`, [`group:${groupId}`, `user:${userId}`], TTL, () =>
    prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      include: { group: true, user: true },
    }),
  );
}

export async function getGroupInvites(groupId: string) {
  return remember(`group:${groupId}:invites`, [`group:${groupId}`], TTL, () =>
    prisma.inviteToken.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function getGroupHome(groupId: string) {
  return remember(`group:${groupId}:home`, [`group:${groupId}`], TTL, async () => {
    const [members, openRows, closedCount, pending] = await Promise.all([
      getGroupMembers(groupId),
      prisma.activity.findMany({
        where: { groupId, status: "open" },
        include: activityCardInclude,
        orderBy: { createdAt: "desc" },
      }),
      prisma.activity.count({ where: { groupId, status: "closed" } }),
      getGroupPendingCounts(groupId),
    ]);
    const ledger = await getGroupLedgerCached(groupId);
    return {
      members,
      budgetAmount: ledger.budgetAmount,
      openActivities: openRows.map(toActivityCard),
      closedCount,
      pending,
    };
  });
}

export async function getClosedActivities(groupId: string) {
  return remember(`group:${groupId}:closed-activities`, [`group:${groupId}`], TTL, async () => {
    const rows = await prisma.activity.findMany({
      where: { groupId, status: "closed" },
      include: activityCardInclude,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toActivityCard);
  });
}

const expenseDetailInclude = {
  group: true,
  activity: true,
  shares: true,
  payers: { include: { user: true } },
  allocations: { include: { payment: { include: { payer: true } } } },
  creator: true,
};

export async function getActivityDetail(groupId: string, activityId: string) {
  return remember(`group:${groupId}:activity:${activityId}`, [`group:${groupId}`], TTL, () =>
    prisma.activity.findFirst({
      where: { id: activityId, groupId },
      include: {
        group: true,
        expenses: {
          include: {
            payers: { include: { user: true } },
            allocations: { include: { payment: { include: { payer: true } } } },
            shares: true,
            creator: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
  );
}

export async function getActivityMeta(groupId: string, activityId: string) {
  return remember(`group:${groupId}:activity-meta:${activityId}`, [`group:${groupId}`], TTL, () =>
    prisma.activity.findFirst({
      where: { id: activityId, groupId },
      include: { group: true },
    }),
  );
}

export async function getExpenseDetail(groupId: string, expenseId: string) {
  return remember(`group:${groupId}:expense:${expenseId}`, [`group:${groupId}`], TTL, () =>
    prisma.expense.findFirst({
      where: { id: expenseId, groupId },
      include: expenseDetailInclude,
    }),
  );
}

export async function getApprovedExpenseOptions(groupId: string, activityId?: string) {
  return remember(
    `group:${groupId}:expense-options:${activityId ?? "all"}`,
    [`group:${groupId}`],
    TTL,
    () =>
      prisma.expense.findMany({
        where: {
          groupId,
          approvalStatus: "approved",
          ...(activityId ? { activityId } : {}),
        },
        select: { id: true, title: true, amount: true, activityId: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
  );
}

export async function getGroupExpenses(groupId: string) {
  return remember(`group:${groupId}:expenses`, [`group:${groupId}`], TTL, () =>
    prisma.expense.findMany({
      where: { groupId },
      include: {
        group: true,
        shares: true,
        payers: { include: { user: true } },
        allocations: { include: { payment: { include: { payer: true } } } },
        activity: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function getGroupPayments(groupId: string) {
  return remember(`group:${groupId}:payments`, [`group:${groupId}`], TTL, () =>
    prisma.payment.findMany({
      where: { groupId },
      include: { payer: true, allocations: true },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function getMyPayments(groupId: string, userId: string, isAdmin: boolean) {
  return remember(`group:${groupId}:my-payments:${userId}:${isAdmin ? "admin" : "me"}`, [`group:${groupId}`], TTL, () =>
    prisma.payment.findMany({
      where: isAdmin
        ? { groupId, OR: [{ payerUserId: userId }, { approvalStatus: "pending" }] }
        : { groupId, payerUserId: userId },
      include: { payer: true, allocations: true },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function getPaymentDetail(groupId: string, paymentId: string) {
  return remember(`group:${groupId}:payment:${paymentId}`, [`group:${groupId}`], TTL, () =>
    prisma.payment.findFirst({
      where: { id: paymentId, groupId },
      include: { payer: true, allocations: true },
    }),
  );
}

export async function getPaymentContributors(groupId: string, activityId?: string) {
  return remember(
    `group:${groupId}:payment-contributors:${activityId ?? "all"}`,
    [`group:${groupId}`],
    TTL,
    async () => {
      const payments = await prisma.payment.findMany({
        where: { groupId, approvalStatus: "approved" },
        include: { payer: true, allocations: true },
        orderBy: { createdAt: "desc" },
      });
      if (!activityId) return payments;
      const expenseIds = new Set(
        (
          await prisma.expense.findMany({
            where: { groupId, activityId },
            select: { id: true },
          })
        ).map((e) => e.id),
      );
      return payments.filter((p) => p.allocations.some((a) => expenseIds.has(a.expenseId)));
    },
  );
}

export async function getUnallocatedSurplus(groupId: string) {
  return remember(`group:${groupId}:unallocated`, [`group:${groupId}`], TTL, async () => {
    const payments = await prisma.payment.findMany({
      where: { groupId, approvalStatus: "approved" },
      select: { amount: true, allocations: { select: { amount: true } } },
    });
    return payments.reduce((s, p) => {
      const used = p.allocations.reduce((n, a) => n + a.amount, 0);
      return s + leftover(p.amount, used);
    }, 0);
  });
}

export async function getGroupPaymentMethods(groupId: string) {
  return remember(`group:${groupId}:methods`, [`group:${groupId}`], TTL, () =>
    prisma.groupPaymentMethod.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function getGroupMemberPaymentMethods(groupId: string) {
  return remember(`group:${groupId}:member-methods`, [`group:${groupId}`], TTL, async () => {
    const members = await getGroupMembers(groupId);
    return prisma.userPaymentMethod.findMany({
      where: { userId: { in: members.map((m) => m.userId) } },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });
  });
}

export async function getExpensePayerMethods(groupId: string, payerUserIds: string[]) {
  if (payerUserIds.length === 0) return [];
  return remember(
    `group:${groupId}:payer-methods:${payerUserIds.slice().sort().join(",")}`,
    [`group:${groupId}`],
    TTL,
    () =>
      prisma.userPaymentMethod.findMany({
        where: { userId: { in: payerUserIds } },
        include: { user: true },
        orderBy: { createdAt: "desc" },
      }),
  );
}

export async function getGroupAuditLogs(groupId: string) {
  return remember(`group:${groupId}:audit`, [`group:${groupId}`], TTL, () =>
    prisma.groupAuditLog.findMany({
      where: { groupId },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
}

export async function getGroupPendingCounts(groupId: string) {
  return remember(`group:${groupId}:pending`, [`group:${groupId}`], TTL, async () => {
    const [expenses, payments] = await Promise.all([
      prisma.expense.count({ where: { groupId, approvalStatus: "pending" } }),
      prisma.payment.count({ where: { groupId, approvalStatus: "pending" } }),
    ]);
    return { expenses, payments };
  });
}

export async function warmAfterLogin(userId: string) {
  try {
    await getUserMemberships(userId);
  } catch (err) {
    console.error("warmAfterLogin", err);
  }
}

export function invalidateUserWorkspace(userId: string) {
  forgetTag(`user:${userId}`);
  forgetPrefix(`user:${userId}:`);
}

export function invalidateGroupWorkspace(groupId: string, memberUserIds: string[] = []) {
  forgetTag(`group:${groupId}`);
  forgetPrefix(`group:${groupId}:`);
  for (const userId of memberUserIds) invalidateUserWorkspace(userId);
}

export function invalidateSession(token: string, userId?: string) {
  forgetPrefix(`session:${token}`);
  forgetTag(`session:${token}`);
  if (userId) invalidateUserWorkspace(userId);
}
