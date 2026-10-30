import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { isAdminRole } from "@/lib/quota";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getGroupAuditLogs, getGroupMembership } from "@/lib/workspace";

export default async function AuditPage({ params }: { params: Promise<{ groupId: string }> }) {
  const user = await requirePageUser();
  const { groupId } = await params;
  const membership = await getGroupMembership(groupId, user.id);
  if (!membership || !isAdminRole(membership.role)) notFound();
  const locale = await getLocale();
  const t = await getTranslations("nav");
  const logs = await getGroupAuditLogs(groupId);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact />
      <h1 className="mt-6 text-2xl font-bold">{t("audit")}</h1>
      <div className="mt-4 space-y-2">
        {logs.map((l) => (
          <div key={l.id} className="card p-3 text-sm">
            <div className="font-medium">{l.action}</div>
            <div className="text-xs text-ink/50">
              {l.actor?.name ?? "—"} · {l.createdAt.toLocaleString(locale)} · {l.entityType}
            </div>
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
