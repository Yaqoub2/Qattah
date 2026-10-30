import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { ActivityForm } from "@/components/activity-form";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getGroupMembership } from "@/lib/workspace";

export default async function NewActivityPage({ params }: { params: Promise<{ groupId: string }> }) {
  const user = await requirePageUser();
  const { groupId } = await params;
  const m = await getGroupMembership(groupId, user.id);
  if (!m) notFound();
  const t = await getTranslations("activity");

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact />
      <h1 className="mt-6 text-2xl font-bold">{t("title")}</h1>
      <ActivityForm groupId={groupId} />
      <BottomNav />
    </div>
  );
}
