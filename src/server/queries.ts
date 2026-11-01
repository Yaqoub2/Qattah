import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { ActivityEntry, FillRow, LedgerMember, SplitMethod, SplitRule } from "@/lib/ledger";

/** Every read the app does lives here. Each function is one round trip unless noted. */

const toRule = (method: SplitMethod | null, value: { toNumber(): number } | null): SplitRule =>
  method && value != null ? { method, value: value.toNumber() } : null;

/** Home screen: the user's groups. Uses group_members(user_id). */
export function listMyGroups(userId: string) {
  return prisma.groupMember.findMany({
    where: { userId },
    select: { role: true, group: { select: { id: true, name: true, currency: true } } },
    orderBy: { group: { createdAt: "desc" } },
  });
}

/**
 * Group header + members, also used as the access check.
 * One SELECT (relation join): groups by PK with group_members(group_id) and users.
 */
export const loadGroup = cache(async (groupId: string, userId: string) => {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      currency: true,
      members: {
        select: {
          userId: true,
          role: true,
          isPaying: true,
          startsOn: true,
          splitMethod: true,
          splitValue: true,
          user: { select: { name: true, email: true, phone: true, locale: true } },
        },
        orderBy: { user: { name: "asc" } },
      },
    },
  });
  if (!group) return null;
  const me = group.members.find((m) => m.userId === userId);
  if (!me) return null;
  const members = group.members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    contact: m.user.email ?? m.user.phone ?? "",
    email: m.user.email,
    phone: m.user.phone,
    locale: m.user.locale,
    role: m.role,
    isPaying: m.isPaying,
    startsOn: m.startsOn,
    rule: toRule(m.splitMethod, m.splitValue),
  }));
  return {
    id: group.id,
    name: group.name,
    currency: group.currency,
    me: members.find((m) => m.userId === userId)!,
    members,
  };
});

export type LoadedGroup = NonNullable<Awaited<ReturnType<typeof loadGroup>>>;
export type GroupMemberView = LoadedGroup["members"][number];

export const ledgerMembers = (g: LoadedGroup): LedgerMember[] =>
  g.members.map(({ userId, isPaying, startsOn, rule }) => ({ userId, isPaying, startsOn, rule }));

/** Activities with expense totals in one aggregate. Uses activities(group_id, starts_on) and expenses(group_id, activity_id). */
export function listActivities(groupId: string) {
  return prisma.$queryRaw<{ id: string; title: string; startsOn: Date; closed: boolean; total: number }[]>`
    SELECT a.id, a.title, a.starts_on AS "startsOn", a.closed_at IS NOT NULL AS closed, COALESCE(SUM(e.amount), 0)::int AS total
    FROM activities a
    LEFT JOIN expenses e ON e.activity_id = a.id AND e.group_id = a.group_id AND e.approved_at IS NOT NULL
    WHERE a.group_id = ${groupId}::uuid
    GROUP BY a.id
    ORDER BY a.starts_on DESC, a.created_at DESC`;
}

/** activity_members rows for the whole group (or one activity). Uses activity_members(group_id) / PK. */
export async function listEntries(groupId: string, activityId?: string): Promise<ActivityEntry[]> {
  const rows = await prisma.activityMember.findMany({
    where: activityId ? { activityId, groupId } : { groupId },
    select: { activityId: true, userId: true, splitMethod: true, splitValue: true },
  });
  return rows.map((r) => ({ activityId: r.activityId, userId: r.userId, rule: toRule(r.splitMethod, r.splitValue) }));
}

/** Per member: approved totals paid out and received from other members. One scan of payments(group_id). */
export async function paymentTotals(groupId: string) {
  const rows = await prisma.$queryRaw<{ userId: string; paidOut: bigint; received: bigint }[]>`
    SELECT user_id AS "userId", SUM(paid_out) AS "paidOut", SUM(received) AS received
    FROM (
      SELECT payer_id AS user_id, amount AS paid_out, 0 AS received FROM payments WHERE group_id = ${groupId}::uuid AND approved_at IS NOT NULL
      UNION ALL
      SELECT payee_id, 0, amount FROM payments WHERE group_id = ${groupId}::uuid AND payee_id IS NOT NULL AND approved_at IS NOT NULL
    ) t
    GROUP BY user_id`;
  return rows.map((r) => ({ userId: r.userId, paidOut: Number(r.paidOut), received: Number(r.received) }));
}

/** One activity with its expenses and tagged payments. Three SELECTs, all by indexed keys. */
export async function loadActivity(groupId: string, activityId: string) {
  const [activity, expenses, payments] = await Promise.all([
    prisma.activity.findFirst({ where: { id: activityId, groupId }, select: { id: true, title: true, startsOn: true, closedAt: true } }),
    prisma.expense.findMany({
      where: { groupId, activityId },
      select: { id: true, title: true, amount: true, sealed: true, receiptPath: true, createdById: true, approvedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.payment.findMany({
      where: { activityId, groupId },
      select: paymentSelect,
      orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  return activity ? { ...activity, closed: activity.closedAt !== null, expenses, payments } : null;
}

const paymentSelect = {
  id: true,
  payerId: true,
  payeeId: true,
  amount: true,
  paidOn: true,
  note: true,
  receiptPath: true,
  createdById: true,
  approvedAt: true,
  activity: { select: { title: true } },
} as const;

/** Payments for the group, newest first (all of them when `take` is omitted). Uses payments(group_id, paid_on). */
export function listPayments(groupId: string, take?: number) {
  return prisma.payment.findMany({
    where: { groupId },
    select: paymentSelect,
    orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
    take,
  });
}

/** Activity picker for the payment form. Uses activities(group_id, starts_on). */
export function activityOptions(groupId: string) {
  return prisma.activity.findMany({
    where: { groupId },
    select: { id: true, title: true },
    orderBy: { startsOn: "desc" },
    take: 50,
  });
}

/** Every approved expense in the group with its activity title, for export. Uses expenses(group_id, activity_id). */
export function listExpenses(groupId: string) {
  return prisma.$queryRaw<{ title: string; amount: number; activity: string; startsOn: Date; createdAt: Date }[]>`
    SELECT e.title, e.amount, a.title AS activity, a.starts_on AS "startsOn", e.created_at AS "createdAt"
    FROM expenses e
    JOIN activities a ON a.id = e.activity_id AND a.group_id = e.group_id
    WHERE e.group_id = ${groupId}::uuid AND e.approved_at IS NOT NULL
    ORDER BY a.starts_on, e.created_at`;
}

const methodSelect = {
  id: true,
  userId: true,
  kind: true,
  label: true,
  iban: true,
  beneficiary: true,
  linkUrl: true,
  qrPath: true,
  details: true,
} as const;

/** The group's accounts and every member's own accounts. One SELECT using payment_methods(group_id) and (user_id). */
export function listGroupMethods(groupId: string) {
  return prisma.paymentMethod.findMany({
    where: { OR: [{ groupId }, { user: { memberships: { some: { groupId } } } }] },
    select: methodSelect,
    orderBy: { createdAt: "asc" },
  });
}

/** The signed-in user's own accounts. Uses payment_methods(user_id). */
export function listMyMethods(userId: string) {
  return prisma.paymentMethod.findMany({ where: { userId }, select: methodSelect, orderBy: { createdAt: "asc" } });
}

export type MethodView = Awaited<ReturnType<typeof listMyMethods>>[number];

/** Members reminded within the cooldown. Uses reminders(group_id, user_id, sent_at). */
export async function recentlyReminded(groupId: string, hours: number) {
  const rows = await prisma.reminder.findMany({
    where: { groupId, sentAt: { gt: new Date(Date.now() - hours * 3_600_000) } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return new Set(rows.map((r) => r.userId));
}

/** Admin queue: everything waiting for approval. Two SELECTs on the partial "pending" indexes. */
export async function listPending(groupId: string) {
  const [expenses, payments] = await Promise.all([
    prisma.expense.findMany({
      where: { groupId, approvedAt: null },
      select: { id: true, title: true, amount: true, receiptPath: true, createdById: true, activity: { select: { title: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.payment.findMany({ where: { groupId, approvedAt: null }, select: paymentSelect, orderBy: { createdAt: "asc" } }),
  ]);
  return { expenses, payments };
}

/**
 * Fills in the group (or one activity), each with its activity's approved expense total and tagged payments,
 * so effectiveFills can tell how much still counts. Uses activity_fills(group_id) / PK, expenses(group_id, activity_id)
 * and payments(activity_id). Fills are one row per member per activity, so this stays small.
 */
export function listFills(groupId: string, activityId?: string) {
  return prisma.$queryRaw<FillRow[]>`
    SELECT f.activity_id AS "activityId", f.user_id AS "userId", f.amount,
      (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e
        WHERE e.group_id = f.group_id AND e.activity_id = f.activity_id AND e.approved_at IS NOT NULL)::int AS total,
      (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
        WHERE p.activity_id = f.activity_id AND p.group_id = f.group_id AND p.approved_at IS NOT NULL)::int AS tagged
    FROM activity_fills f
    WHERE f.group_id = ${groupId}::uuid ${activityId ? Prisma.sql`AND f.activity_id = ${activityId}::uuid` : Prisma.empty}`;
}
