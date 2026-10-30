import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { ExpenseForm } from "@/components/expense-form";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isAdminRole } from "@/lib/quota";
import { fromMinor } from "@/lib/money";
import {
  getExpenseDetail,
  getGroupMembers,
  getGroupMembership,
  getUnallocatedSurplus,
} from "@/lib/workspace";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ groupId: string; expenseId: string }>;
}) {
  const user = await requirePageUser();
  const { groupId, expenseId } = await params;
  const [expense, membership, members, unallocated] = await Promise.all([
    getExpenseDetail(groupId, expenseId),
    getGroupMembership(groupId, user.id),
    getGroupMembers(groupId),
    getUnallocatedSurplus(groupId),
  ]);
  if (!expense || !membership) notFound();
  if (expense.activity.status === "closed") notFound();
  if (!isAdminRole(membership.role) && expense.createdById !== user.id) notFound();
  const t = await getTranslations("expense");
  const included = Object.fromEntries(
    members.map((m) => [m.userId, expense.shares.some((s) => s.userId === m.userId && s.included)]),
  );
  const weights = Object.fromEntries(
    members.map((m) => [m.userId, expense.shares.find((s) => s.userId === m.userId)?.shareWeight ?? m.defaultShare]),
  );
  const pcts = Object.fromEntries(
    members.map((m) => [
      m.userId,
      expense.shares.find((s) => s.userId === m.userId)?.percentage
        ? Number(expense.shares.find((s) => s.userId === m.userId)?.percentage)
        : (m.defaultPercentage ? Number(m.defaultPercentage) : 0),
    ]),
  );
  const amts = Object.fromEntries(
    members.map((m) => [
      m.userId,
      expense.shares.find((s) => s.userId === m.userId)?.amountOverride ?? m.defaultAmount ?? 0,
    ]),
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact showRefresh refreshGroupId={groupId} />
      <h1 className="mt-6 text-2xl font-bold">{t("edit")}</h1>
      <div className="mt-4">
        <ExpenseForm
          groupId={groupId}
          activityId={expense.activityId}
          currency={expense.group.currency}
          defaultSplit={expense.group.defaultSplitMethod}
          members={members.map((m) => ({
            userId: m.userId,
            name: m.user.name,
            isPayingUser: m.isPayingUser,
            defaultShare: m.defaultShare,
            defaultPercentage: m.defaultPercentage ? Number(m.defaultPercentage) : null,
            defaultAmount: m.defaultAmount,
          }))}
          showKafu={isAdminRole(membership.role)}
          expenseId={expense.id}
          budgetAmount={unallocated + expense.budgetPaidAmount}
          initial={{
            title: expense.title,
            amountMajor: String(fromMinor(expense.amount, expense.group.currency)),
            notes: expense.notes ?? "",
            splitMethod: expense.splitMethod,
            included,
            weights,
            pcts,
            amts,
            payers: expense.payers.map((p) => ({
              userId: p.userId,
              major: String(fromMinor(p.amount, expense.group.currency)),
            })),
            isSealed: expense.isSealed,
          }}
        />
      </div>
      <BottomNav />
    </div>
  );
}
