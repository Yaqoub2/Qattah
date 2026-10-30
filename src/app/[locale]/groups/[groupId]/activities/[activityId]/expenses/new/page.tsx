import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { ExpenseForm } from "@/components/expense-form";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActivityMeta, getGroupMembers, getGroupMembership, getUnallocatedSurplus } from "@/lib/workspace";

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ groupId: string; activityId: string }>;
}) {
  const user = await requirePageUser();
  const { groupId, activityId } = await params;
  const [activity, membership, members, unallocated] = await Promise.all([
    getActivityMeta(groupId, activityId),
    getGroupMembership(groupId, user.id),
    getGroupMembers(groupId),
    getUnallocatedSurplus(groupId),
  ]);
  if (!activity || !membership) notFound();
  if (activity.status === "closed") notFound();
  const t = await getTranslations("activity");

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact showRefresh refreshGroupId={groupId} />
      <h1 className="mt-6 text-2xl font-bold">{t("newExpense")}</h1>
      <div className="mt-4">
        <ExpenseForm
          groupId={groupId}
          activityId={activityId}
          currency={activity.group.currency}
          defaultSplit={activity.group.defaultSplitMethod}
          members={members.map((m) => ({
            userId: m.userId,
            name: m.user.name,
            isPayingUser: m.isPayingUser,
            defaultShare: m.defaultShare,
            defaultPercentage: m.defaultPercentage ? Number(m.defaultPercentage) : null,
            defaultAmount: m.defaultAmount,
          }))}
          showKafu={membership.role === "owner" || membership.role === "admin"}
          budgetAmount={unallocated}
        />
      </div>
      <BottomNav />
    </div>
  );
}
