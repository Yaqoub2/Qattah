"use server";

import { z } from "zod";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { prisma } from "@/server/db";
import { actionMember, ActionError } from "@/server/guard";
import { Prisma } from "@prisma/client";
import { f, formAction, toMinorOrThrow, toSplitColumns, withUpload } from "@/server/action";
import { approvalFor } from "@/server/approval";
import { removeFiles } from "@/server/storage";
import { activityParticipants, closingDues, paymentsCover, splitActivity } from "@/lib/ledger";
import { ledgerMembers, listEntries, loadActivity, loadGroup } from "@/server/queries";

/** One INSERT into activities. */
export const createActivity = formAction(
  z.object({ groupId: f.id, title: f.text(80), startsOn: f.date }),
  async ({ groupId, title, startsOn }) => {
    await actionMember(groupId, { admin: true });
    const a = await prisma.activity.create({
      data: { groupId, title, ...(startsOn ? { startsOn } : {}) },
      select: { id: true },
    });
    redirect({ href: `/groups/${groupId}/activities/${a.id}`, locale: await getLocale() });
  },
);

/** Untags its payments (they stay in the ledger), then deletes the activity; expenses cascade. Closed: reopen first. */
export const deleteActivity = formAction(z.object({ groupId: f.id, activityId: f.id }), async ({ groupId, activityId }) => {
  await actionMember(groupId, { admin: true });
  const receipts = await prisma.expense.findMany({
    where: { groupId, activityId, receiptPath: { not: null } },
    select: { receiptPath: true },
  });
  const [, deleted] = await prisma.$transaction([
    prisma.payment.updateMany({ where: { groupId, activityId, activity: { closedAt: null } }, data: { activityId: null } }),
    prisma.activity.deleteMany({ where: { id: activityId, groupId, closedAt: null } }),
  ]);
  if (!deleted.count) throw new ActionError("activity_closed");
  await removeFiles(receipts.map((r) => r.receiptPath));
  redirect({ href: `/groups/${groupId}`, locale: await getLocale() });
});

/** UPSERT on activity_members PK: lists the member on this activity and sets or clears its rule. */
export const setActivityMember = formAction(
  z.object({ groupId: f.id, activityId: f.id, userId: f.id, splitMethod: f.splitMethod, splitValue: f.splitValue }),
  async (input) => {
    const { currency } = await actionMember(input.groupId, { admin: true });
    const split = toSplitColumns(input.splitMethod, input.splitValue, currency);
    await prisma.activityMember.upsert({
      where: { activityId_userId: { activityId: input.activityId, userId: input.userId } },
      create: { activityId: input.activityId, groupId: input.groupId, userId: input.userId, ...split },
      update: split,
    });
  },
);

/** DELETE on activity_members PK. */
export const removeActivityMember = formAction(
  z.object({ groupId: f.id, activityId: f.id, userId: f.id }),
  async ({ groupId, activityId, userId }) => {
    await actionMember(groupId, { admin: true });
    await prisma.activityMember.deleteMany({ where: { activityId, userId, groupId } });
  },
);

/**
 * Optional receipt upload, then one INSERT. The composite FK rejects an activity from another group.
 * Admin entries count at once; a member's entry waits in the admin queue.
 */
export const addExpense = formAction(
  z.object({ groupId: f.id, activityId: f.id, title: f.text(80), amount: f.money, sealed: f.checkbox, receipt: f.file }),
  async ({ groupId, activityId, title, amount, sealed, receipt }) => {
    const { user, admin, currency } = await actionMember(groupId);
    const minor = toMinorOrThrow(amount, currency);
    await withUpload(receipt, `groups/${groupId}/receipts`, (receiptPath) =>
      prisma.expense.create({
        data: {
          groupId,
          activityId,
          title,
          amount: minor,
          sealed: admin && sealed,
          receiptPath,
          createdById: user.id,
          ...approvalFor(admin, user.id),
        },
      }),
    );
  },
);

/** Delete or reject. Admins: any expense. Members: only their own pending ones. Then removes the receipt. */
export const deleteExpense = formAction(z.object({ groupId: f.id, expenseId: f.id }), async ({ groupId, expenseId }) => {
  const { user, admin } = await actionMember(groupId);
  const rows = await prisma.$queryRaw<{ receiptPath: string | null }[]>`
    DELETE FROM expenses
    WHERE id = ${expenseId}::uuid AND group_id = ${groupId}::uuid ${admin ? Prisma.empty : Prisma.sql`AND created_by_id = ${user.id}::uuid AND approved_at IS NULL`}
    RETURNING receipt_path AS "receiptPath"`;
  if (!rows.length) throw new ActionError("not_allowed");
  await removeFiles([rows[0].receiptPath]);
});

/** Admin edits an expense. One UPDATE; the trigger refuses amount changes on sealed expenses and closed activities. */
export const updateExpense = formAction(
  z.object({ groupId: f.id, expenseId: f.id, title: f.text(80), amount: f.money }),
  async ({ groupId, expenseId, title, amount }) => {
    const { currency } = await actionMember(groupId, { admin: true });
    const { count } = await prisma.expense.updateMany({
      where: { id: expenseId, groupId },
      data: { title, amount: toMinorOrThrow(amount, currency) },
    });
    if (!count) throw new ActionError("not_found");
  },
);

/** Admin fixes an approved expense's amount for good. One conditional UPDATE. */
export const sealExpense = formAction(z.object({ groupId: f.id, expenseId: f.id }), async ({ groupId, expenseId }) => {
  await actionMember(groupId, { admin: true });
  const { count } = await prisma.expense.updateMany({
    where: { id: expenseId, groupId, sealed: false, approvedAt: { not: null } },
    data: { sealed: true },
  });
  if (!count) throw new ActionError("already_handled");
});

/**
 * Close: freezes every participant's due as a fixed amount in activity_members, then sets closed_at,
 * in one transaction. Dues above the expenses are scaled down to match them (closingDues).
 * Refused while expenses are pending, a participant has no due, or tagged payments don't cover the expenses.
 * Queries: group with members, the activity, its activity_members; then the upserts and one conditional UPDATE.
 */
export const closeActivity = formAction(z.object({ groupId: f.id, activityId: f.id }), async ({ groupId, activityId }) => {
  const { user } = await actionMember(groupId, { admin: true });
  const [group, activity, entries] = await Promise.all([
    loadGroup(groupId, user.id),
    loadActivity(groupId, activityId),
    listEntries(groupId, activityId),
  ]);
  if (!group || !activity) throw new ActionError("not_found");
  if (activity.closed) throw new ActionError("activity_closed");
  if (activity.expenses.some((e) => !e.approvedAt)) throw new ActionError("has_pending");
  const total = activity.expenses.reduce((sum, e) => sum + e.amount, 0);
  const split = splitActivity(total, activityParticipants({ ...activity, total }, ledgerMembers(group), entries));
  if (split.unset.length > 0) throw new ActionError("split_incomplete");
  if (!paymentsCover(total, activity.payments.filter((p) => p.approvedAt))) throw new ActionError("payments_short");

  await prisma.$transaction([
    ...Object.entries(closingDues(split)).map(([userId, due]) => {
      const frozen = { splitMethod: "amount" as const, splitValue: new Prisma.Decimal(due) };
      return prisma.activityMember.upsert({
        where: { activityId_userId: { activityId, userId } },
        create: { activityId, groupId, userId, ...frozen },
        update: frozen,
      });
    }),
    prisma.activity.updateMany({ where: { id: activityId, groupId, closedAt: null }, data: { closedAt: new Date() } }),
  ]);
});

/** Reopen: one UPDATE. The frozen amounts stay as overrides; an admin can clear them per member. */
export const reopenActivity = formAction(z.object({ groupId: f.id, activityId: f.id }), async ({ groupId, activityId }) => {
  await actionMember(groupId, { admin: true });
  await prisma.activity.updateMany({ where: { id: activityId, groupId }, data: { closedAt: null } });
});
