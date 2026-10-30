import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { Link } from "@/i18n/routing";
import { closeActivity, reopenActivity, deleteActivity } from "@/actions/activities";
import { setExpenseApproval } from "@/actions/expenses";
import { getLocale, getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/money";
import { allocatedFromUser, collectedOf, paySuggestion, remainingDueOnExpense, wasMemberAt } from "@/lib/ledger";
import { notFound } from "next/navigation";
import { isAdminRole } from "@/lib/quota";
import { ServerFormAction } from "@/lib/utils";
import { RemindForm } from "@/components/remind-form";
import { FoldSection } from "@/components/fold-section";
import { ContributorList } from "@/components/contributor-list";
import { DeleteRecordButton } from "@/components/delete-record";
import { contributorsForExpenses } from "@/lib/contributors";
import { isAnonymousUser } from "@/lib/anonymous";
import { getActivityDetail, getGroupMembership } from "@/lib/workspace";
import { Plus } from "lucide-react";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ groupId: string; activityId: string }>;
}) {
  const user = await requirePageUser();
  const { groupId, activityId } = await params;
  const [activity, membership] = await Promise.all([
    getActivityDetail(groupId, activityId),
    getGroupMembership(groupId, user.id),
  ]);
  if (!activity || !membership) notFound();
  const admin = isAdminRole(membership.role);
  const t = await getTranslations();
  const locale = await getLocale();
  const open = activity.status === "open";
  const hasSealedExpense = activity.expenses.some((e) => e.isSealed);

  const visible = activity.expenses.filter((e) => e.approvalStatus === "approved" || admin || e.createdById === user.id);
  const anonLabel = t("payment.anonymous");
  const contributors = contributorsForExpenses(
    visible
      .filter((e) => e.approvalStatus === "approved")
      .map((e) => ({
        ...e,
        payers: e.payers.map((p) => ({
          ...p,
          user: p.user
            ? { name: isAnonymousUser(p.user) ? anonLabel : p.user.name }
            : p.user,
        })),
        allocations: e.allocations.map((a) => ({
          ...a,
          payment: a.payment
            ? {
                ...a.payment,
                payer: a.payment.payer
                  ? { name: isAnonymousUser(a.payment.payer) ? anonLabel : a.payment.payer.name }
                  : a.payment.payer,
              }
            : a.payment,
        })),
      })),
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact showRefresh refreshGroupId={groupId} />
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
        {open ? t("group.open") : t("group.closed")}
        {activity.startsAt ? ` · ${activity.startsAt.toLocaleDateString(locale)}` : ""}
        {activity.endsAt ? ` → ${activity.endsAt.toLocaleDateString(locale)}` : ""}
      </p>
      <h1 className="mt-1 text-2xl font-bold">{activity.title}</h1>
      {activity.description && <p className="mt-1 text-ink/60">{activity.description}</p>}
      {open && (admin || activity.createdById === user.id) && (
        <Link href={`/groups/${groupId}/activities/${activityId}/edit`} className="mt-2 inline-block text-sm text-teal">
          {t("activity.edit")}
        </Link>
      )}

      {open ? (
        <Link
          href={`/groups/${groupId}/activities/${activityId}/expenses/new`}
          className="btn btn-primary mt-5 min-h-14 w-full text-base"
        >
          <Plus size={20} />
          {t("activity.newExpense")}
        </Link>
      ) : (
        <p className="mt-4 rounded-2xl bg-ink/5 px-4 py-3 text-sm text-ink/55">{t("activity.closedHint")}</p>
      )}
      {open && <p className="mt-2 text-center text-xs text-ink/45">{t("activity.createExpenseHint")}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/groups/${groupId}/payments/new?activityId=${activityId}`}
          className="btn btn-ghost"
        >
          {t("expense.pay")}
        </Link>
        <Link href={`/groups/${groupId}/reports?activityId=${activityId}`} className="btn btn-ghost">
          {t("nav.reports")}
        </Link>
        {admin && open && (
          <form action={closeActivity as ServerFormAction}>
            <input type="hidden" name="activityId" value={activityId} />
            <button className="btn btn-ghost">{t("activity.close")}</button>
          </form>
        )}
        {admin && !open && (
          <form action={reopenActivity as ServerFormAction}>
            <input type="hidden" name="activityId" value={activityId} />
            <button className="btn btn-ghost">{t("activity.reopen")}</button>
          </form>
        )}
        {admin && !hasSealedExpense && (
          <DeleteRecordButton
            action={deleteActivity}
            hidden={{ activityId }}
            label={t("activity.delete")}
            confirmMessage={t("common.confirmDelete")}
            redirectTo={`/groups/${groupId}`}
          />
        )}
      </div>

      <ContributorList items={contributors} currency={activity.group.currency} locale={locale} />

      <h2 className="mt-8 font-bold">{t("activity.expensesTitle")}</h2>
      <div className="mt-3 space-y-3">
        {visible.length === 0 && <div className="card p-5 text-ink/50">{t("activity.emptyExpenses")}</div>}
        {visible.map((e) => {
          const collected = collectedOf(e);
          const myShare = e.shares.find((s) => s.userId === user.id);
          const unpaid = collected < e.amount && e.approvalStatus === "approved";
          const countsForMe = wasMemberAt(membership.invitedAt, e.createdAt);
          const allocatedMine = allocatedFromUser(
            e.allocations.map((a) => ({
              amount: a.amount,
              payerUserId: a.payment?.payerUserId,
            })),
            user.id,
          );
          const myDue = countsForMe ? remainingDueOnExpense(myShare?.dueAmount ?? 0, allocatedMine) : 0;
          const suggestion = paySuggestion({
            expenseUnpaid: unpaid,
            baselineAmount: 0,
            demandAmount: myDue,
          });
          return (
            <div key={e.id} className="card p-4">
              <Link href={`/groups/${groupId}/expenses/${e.id}`} className="block">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{e.title}</div>
                    <div className="text-xs text-ink/50">
                      {formatMoney(e.amount, activity.group.currency, locale)}
                      {e.approvalStatus !== "approved" ? ` · ${t("group.pending")}` : ""}
                      {e.isSealed ? ` · ${t("expense.sealed")}` : ""}
                    </div>
                  </div>
                  <div className="text-end text-xs">
                    <div>
                      {t("group.due")}: {formatMoney(myDue, activity.group.currency, locale)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full bg-teal"
                    style={{ width: `${Math.min(100, (collected / e.amount) * 100)}%` }}
                  />
                </div>
              </Link>
              {unpaid && countsForMe && (
                <Link
                  href={`/groups/${groupId}/payments/new?activityId=${activityId}&expenseId=${e.id}&amount=${suggestion}`}
                  className="btn btn-primary mt-3 !min-h-10 w-full text-sm"
                >
                  {t("expense.pay")}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {admin &&
        activity.expenses
          .filter((e) => e.approvalStatus === "pending")
          .map((e) => (
            <form key={`a-${e.id}`} action={setExpenseApproval as ServerFormAction} className="mt-2 flex gap-2">
              <input type="hidden" name="expenseId" value={e.id} />
              <button name="status" value="approved" className="btn btn-primary text-sm">
                {t("expense.approve")} {e.title}
              </button>
              <button name="status" value="rejected" className="btn btn-ghost text-sm">
                {t("expense.reject")}
              </button>
            </form>
          ))}

      {admin && (
        <div className="mt-8">
          <FoldSection title={t("activity.remindToggle")}>
            <RemindForm groupId={groupId} targetType="activity" targetId={activityId} />
          </FoldSection>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
