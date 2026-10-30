import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { NetChart } from "@/components/net-chart";
import { formatMoney, fromMinor } from "@/lib/money";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAdminRole } from "@/lib/quota";
import { PrintButton } from "@/components/print-button";
import { getGroupExpenses, getGroupMembers, getGroupMembership, getGroupPayments } from "@/lib/workspace";

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ activityId?: string; expenseId?: string }>;
}) {
  const user = await requirePageUser();
  const { groupId } = await params;
  const q = await searchParams;
  const membership = await getGroupMembership(groupId, user.id);
  if (!membership) notFound();
  const t = await getTranslations("report");
  const tg = await getTranslations("group");
  const locale = await getLocale();
  const admin = isAdminRole(membership.role);

  const [members, allExpenses, allPayments] = await Promise.all([
    getGroupMembers(groupId),
    getGroupExpenses(groupId),
    getGroupPayments(groupId),
  ]);
  const expenses = allExpenses.filter(
    (e) =>
      e.approvalStatus === "approved" &&
      (!q.activityId || e.activityId === q.activityId) &&
      (!q.expenseId || e.id === q.expenseId),
  );
  const payments = allPayments.filter((p) => p.approvalStatus === "approved");

  const chart = members.map((m) => ({
    name: m.user.name,
    net: fromMinor(m.netAmount, membership.group.currency),
    due: fromMinor(m.dueAmount, membership.group.currency),
    paid: fromMinor(m.paidAmount, membership.group.currency),
  }));

  const title = q.expenseId ? t("expense") : q.activityId ? t("activity") : t("group");

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact />
      <h1 className="mt-6 text-2xl font-bold">{title}</h1>
      <div className="no-print mt-3 flex gap-2">
        <a
          className="btn btn-primary text-sm"
          href={`/api/groups/${groupId}/export?format=xlsx${q.activityId ? `&activityId=${q.activityId}` : ""}${q.expenseId ? `&expenseId=${q.expenseId}` : ""}`}
        >
          {t("exportXlsx")}
        </a>
        <PrintButton label={t("print")} />
      </div>
      <div className="card mt-4 p-3">
        <div className="mb-2 text-sm font-semibold">{t("paidVsDue")}</div>
        <NetChart data={chart} />
      </div>
      <div className="mt-4 space-y-2">
        {members.map((m) => (
          <div key={m.userId} className="flex justify-between text-sm">
            <span>{m.user.name}</span>
            <span>
              {formatMoney(m.netAmount, membership.group.currency, locale)}
              {admin || m.userId === user.id
                ? ` · ${m.userId === user.id ? tg("due") : tg("shareDue")} ${formatMoney(m.dueAmount, membership.group.currency, locale)}`
                : ""}
            </span>
          </div>
        ))}
      </div>
      <h2 className="mt-6 font-bold">{t("expenses")}</h2>
      {expenses.map((e) => (
        <div key={e.id} className="mt-2 text-sm">
          {e.activity.title} · {e.title} · {formatMoney(e.amount, membership.group.currency, locale)}
        </div>
      ))}
      <h2 className="mt-6 font-bold">{t("payments")}</h2>
      {payments.map((p) => (
        <div key={p.id} className="mt-2 text-sm">
          {p.payer.name} · {formatMoney(p.amount, membership.group.currency, locale)}
        </div>
      ))}
      <BottomNav />
    </div>
  );
}
