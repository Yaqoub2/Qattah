import { requirePageUser } from "@/lib/page-auth";
import { markGroupEntered } from "@/actions/groups";
import { Brand, BottomNav } from "@/components/shell";
import { Link } from "@/i18n/routing";
import { getLocale, getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/money";
import { notFound } from "next/navigation";
import { isAdminRole } from "@/lib/quota";
import { KafuMark } from "@/components/kafu-mark";
import { RecheckBalances } from "@/components/recheck-balances";
import { ActivityCardLink } from "@/components/activity-card";
import { ClosedActivitiesFold } from "@/components/closed-activities-fold";
import { getGroupHome, getGroupMembership } from "@/lib/workspace";

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const user = await requirePageUser();
  const { groupId } = await params;
  const membership = await getGroupMembership(groupId, user.id);
  if (!membership) notFound();
  const group = membership.group;
  if (!membership.firstEnteredAt) await markGroupEntered(groupId);

  const t = await getTranslations();
  const locale = await getLocale();
  const admin = isAdminRole(membership.role);

  const { members, budgetAmount, openActivities, closedCount, pending } = await getGroupHome(groupId);
  const pendingTotal = pending.expenses + pending.payments;
  const empty = openActivities.length === 0 && closedCount === 0;
  const mine = members.find((m) => m.userId === user.id);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <header className="flex items-center justify-between gap-3">
        <Brand compact showRefresh refreshGroupId={groupId} />
        <div className="text-end">
          <h1 className="text-xl font-bold">{membership.group.name}</h1>
          <p className="text-xs text-ink/50">{membership.group.currency}</p>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="card p-3">
          <div className="text-[11px] leading-tight text-ink/50">{t("home.net")}</div>
          <div className={`mt-1 text-sm font-bold ${(mine?.netAmount ?? 0) >= 0 ? "text-teal" : "text-rose"}`}>
            {formatMoney(mine?.netAmount ?? 0, group.currency, locale)}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-[11px] leading-tight text-ink/50">{t("group.due")}</div>
          <div className="mt-1 text-sm font-bold">
            {formatMoney(mine?.dueAmount ?? 0, group.currency, locale)}
          </div>
        </div>
      </div>

      <RecheckBalances groupId={groupId} isAdmin={admin} />

      <div className="card mt-3 flex items-center justify-between p-3">
        <div>
          <div className="text-[11px] text-ink/50">
            {budgetAmount >= 0 ? t("group.budgetSurplus") : t("group.budgetDeficit")}
          </div>
          <div className={`text-sm font-semibold ${budgetAmount >= 0 ? "text-teal" : "text-rose"}`}>
            {formatMoney(budgetAmount, group.currency, locale)}
          </div>
        </div>
        {admin && (
          <Link href={`/groups/${groupId}/settings`} className="text-xs text-teal">
            {t("group.depositBudget")}
          </Link>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={`/groups/${groupId}/members`} className="btn btn-ghost">
          {t("nav.members")}
        </Link>
        <Link href={`/groups/${groupId}/payments/new`} className="btn btn-ghost">
          {t("nav.payments")}
        </Link>
        <Link href={`/groups/${groupId}/reports`} className="btn btn-ghost">
          {t("nav.reports")}
        </Link>
        {admin && (
          <>
            <Link href={`/groups/${groupId}/settings`} className="btn btn-ghost">
              {t("nav.settings")}
            </Link>
            <Link href={`/groups/${groupId}/audit`} className="btn btn-ghost">
              {t("nav.audit")}
            </Link>
          </>
        )}
      </div>

      {admin && pendingTotal > 0 && (
        <div className="mt-4 rounded-2xl bg-amber/15 px-4 py-3 text-sm">
          {t("group.pending")}: {pendingTotal}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-bold">{t("group.activities")}</h2>
        <Link href={`/groups/${groupId}/activities/new`} className="btn btn-primary text-sm">
          {t("group.newActivity")}
        </Link>
      </div>

      <div className="mt-3 space-y-3">
        {empty && <div className="card p-5 text-ink/50">{t("group.noActivities")}</div>}
        {openActivities.map((a) => (
          <ActivityCardLink key={a.id} groupId={groupId} activity={a} currency={group.currency} locale={locale} />
        ))}
        <ClosedActivitiesFold groupId={groupId} count={closedCount} currency={group.currency} locale={locale} />
      </div>

      <h2 className="mt-8 font-bold">{t("group.balances")}</h2>
      <div className="mt-3 space-y-2">
        {members.map((mem) => (
          <div key={mem.userId} className="flex items-center justify-between rounded-2xl bg-white/70 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">{mem.user.name}</div>
              {admin && <KafuMark active={mem.isPayingUser} />}
            </div>
            <div className={`text-sm font-semibold ${mem.netAmount >= 0 ? "text-teal" : "text-rose"}`}>
              {formatMoney(mem.netAmount, group.currency, locale)}
            </div>
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
