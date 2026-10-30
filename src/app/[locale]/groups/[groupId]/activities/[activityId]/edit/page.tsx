import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { ActivityForm } from "@/components/activity-form";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAdminRole } from "@/lib/quota";
import { toDatetimeLocalValue } from "@/lib/datetime";
import { getActivityMeta, getGroupMembership } from "@/lib/workspace";

export default async function EditActivityPage({
  params,
}: {
  params: Promise<{ groupId: string; activityId: string }>;
}) {
  const user = await requirePageUser();
  const { groupId, activityId } = await params;
  const [activity, membership] = await Promise.all([
    getActivityMeta(groupId, activityId),
    getGroupMembership(groupId, user.id),
  ]);
  if (!activity || !membership) notFound();
  if (activity.status === "closed") notFound();
  if (!isAdminRole(membership.role) && activity.createdById !== user.id) notFound();
  const t = await getTranslations("activity");

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact showRefresh refreshGroupId={groupId} />
      <h1 className="mt-6 text-2xl font-bold">{t("edit")}</h1>
      <ActivityForm
        groupId={groupId}
        activityId={activityId}
        initial={{
          title: activity.title,
          description: activity.description ?? "",
          startsAt: toDatetimeLocalValue(activity.startsAt),
          endsAt: toDatetimeLocalValue(activity.endsAt),
        }}
      />
      <BottomNav />
    </div>
  );
}
