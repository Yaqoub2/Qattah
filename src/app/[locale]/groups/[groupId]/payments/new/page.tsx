import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { PaymentForm } from "@/components/payment-form";
import { setPaymentApproval, deletePayment } from "@/actions/payments";
import { isAdminRole } from "@/lib/quota";
import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/money";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ServerFormAction } from "@/lib/utils";
import { DeleteRecordButton } from "@/components/delete-record";
import { ConfirmActionButton } from "@/components/confirm-action";
import { isAnonymousUser } from "@/lib/anonymous";
import { Link } from "@/i18n/routing";
import { PaymentContributorsFold } from "@/components/payment-contributors-fold";
import {
  getApprovedExpenseOptions,
  getGroupMembers,
  getGroupMembership,
  getMyPayments,
  getUnallocatedSurplus,
} from "@/lib/workspace";

export default async function NewPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ expenseId?: string; amount?: string; activityId?: string }>;
}) {
  const user = await requirePageUser();
  const { groupId } = await params;
  const q = await searchParams;
  const membership = await getGroupMembership(groupId, user.id);
  if (!membership) notFound();
  const admin = isAdminRole(membership.role);
  const [members, expenses, payments, unallocated] = await Promise.all([
    getGroupMembers(groupId),
    getApprovedExpenseOptions(groupId, q.activityId),
    getMyPayments(groupId, user.id, admin),
    getUnallocatedSurplus(groupId),
  ]);
  const pending = payments.filter((p) => p.approvalStatus === "pending");
  const mineApproved = payments
    .filter((p) => p.approvalStatus === "approved" && p.payerUserId === user.id)
    .slice(0, 30);
  const t = await getTranslations();
  const locale = await getLocale();
  const visiblePending = admin ? pending : pending.filter((p) => p.payerUserId === user.id);

  function payerLabel(p: (typeof payments)[number]) {
    return isAnonymousUser(p.payer) ? t("payment.anonymous") : p.payer.name;
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact showRefresh refreshGroupId={groupId} />
      <h1 className="mt-6 text-2xl font-bold">{t("payment.title")}</h1>
      <div className="mt-4">
        <PaymentForm
          groupId={groupId}
          currency={membership.group.currency}
          members={members.map((m) => ({ userId: m.userId, name: m.user.name }))}
          expenses={expenses.map((e) => ({ id: e.id, title: e.title, amount: e.amount }))}
          defaultPayer={user.id}
          defaultExpenseId={q.expenseId}
          defaultAmountMinor={q.amount ? Number(q.amount) : undefined}
          allowOutsidePayers={admin}
          budgetAmount={unallocated}
        />
      </div>
      <PaymentContributorsFold
        groupId={groupId}
        activityId={q.activityId}
        currency={membership.group.currency}
        locale={locale}
      />
      {mineApproved.length > 0 && (
        <div className="mt-6 space-y-2">
          <h2 className="font-bold">{t("payment.history")}</h2>
          {mineApproved.map((p) => (
            <div key={p.id} className="card p-3">
              <div className="text-sm">
                {payerLabel(p)} · {formatMoney(p.amount, membership.group.currency, locale)}
              </div>
            </div>
          ))}
        </div>
      )}
      {visiblePending.length > 0 && (
        <div className="mt-6 space-y-2">
          <h2 className="font-bold">{t("group.pending")}</h2>
          {visiblePending.map((p) => (
            <div key={p.id} className="card space-y-2 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm">
                  {payerLabel(p)} · {formatMoney(p.amount, membership.group.currency, locale)}
                </div>
                {(admin || p.payerUserId === user.id) && (
                  <Link href={`/groups/${groupId}/payments/${p.id}/edit`} className="text-xs text-teal">
                    {t("payment.edit")}
                  </Link>
                )}
              </div>
              {admin && (
                <div className="flex flex-wrap items-center gap-2">
                  <ConfirmActionButton
                    action={setPaymentApproval}
                    hidden={{ paymentId: p.id, status: "approved" }}
                    label={t("expense.approve")}
                    confirmMessage={t("payment.approveConfirm")}
                  />
                  <form action={setPaymentApproval as ServerFormAction}>
                    <input type="hidden" name="paymentId" value={p.id} />
                    <button name="status" value="rejected" className="btn btn-ghost !min-h-9 text-xs">
                      {t("expense.reject")}
                    </button>
                  </form>
                  <DeleteRecordButton
                    action={deletePayment}
                    hidden={{ paymentId: p.id }}
                    label={t("payment.delete")}
                    confirmMessage={t("common.confirmDelete")}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <BottomNav />
    </div>
  );
}
