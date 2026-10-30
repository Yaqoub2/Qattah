import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { Link } from "@/i18n/routing";
import { setExpenseApproval, deleteExpense } from "@/actions/expenses";
import { expenseCollectTemplate } from "@/actions/reminders";
import { isAdminRole } from "@/lib/quota";
import { RemindForm } from "@/components/remind-form";
import { formatMoney } from "@/lib/money";
import { allocatedFromUser, collectedOf, collectionDemand, paySuggestion, remainingDueOnExpense, wasMemberAt } from "@/lib/ledger";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ServerFormAction } from "@/lib/utils";
import { DeleteRecordButton } from "@/components/delete-record";
import { PayFromBudgetForm } from "@/components/payment-form";
import {
  getExpenseDetail,
  getExpensePayerMethods,
  getGroupMembers,
  getGroupMembership,
  getGroupPaymentMethods,
  getUnallocatedSurplus,
} from "@/lib/workspace";

export default async function ExpensePage({
  params,
}: {
  params: Promise<{ groupId: string; expenseId: string }>;
}) {
  const user = await requirePageUser();
  const { groupId, expenseId } = await params;
  const [expense, membership, members] = await Promise.all([
    getExpenseDetail(groupId, expenseId),
    getGroupMembership(groupId, user.id),
    getGroupMembers(groupId),
  ]);
  if (!expense || !membership) notFound();
  const admin = isAdminRole(membership.role);
  const t = await getTranslations();
  const locale = await getLocale();

  const my = expense.shares.find((s) => s.userId === user.id);
  const collected = collectedOf({ allocations: expense.allocations });
  const unpaid = collected < expense.amount;
  const remaining = Math.max(0, expense.amount - collected);
  const countsForMe = wasMemberAt(membership.invitedAt, expense.createdAt);
  const allocatedMine = allocatedFromUser(
    expense.allocations.map((a) => ({
      amount: a.amount,
      payerUserId: a.payment?.payerUserId,
    })),
    user.id,
  );
  const myDue = countsForMe ? remainingDueOnExpense(my?.dueAmount ?? 0, allocatedMine) : 0;
  const payerPaymentIds = new Set(
    expense.payers.map((p) => ("paymentId" in p ? p.paymentId : null)).filter((id): id is string => Boolean(id)),
  );
  const budgetAllocations = expense.allocations.filter((a) => !payerPaymentIds.has(a.paymentId));

  const demand = collectionDemand({
    remaining,
    nets: members
      .filter((m) => wasMemberAt(m.invitedAt, expense.createdAt))
      .map((m) => ({
        userId: m.userId,
        net: m.netAmount,
        isPayingUser: m.isPayingUser,
      })),
  });
  const suggestion = paySuggestion({
    expenseUnpaid: unpaid,
    baselineAmount: 0,
    demandAmount: myDue || (demand[user.id] ?? 0),
  });

  const showPayFromBudget = unpaid && (admin || membership.group.membersCanSubmit) && expense.approvalStatus === "approved";
  const [template, methods, userMethods, unallocated] = await Promise.all([
    admin ? expenseCollectTemplate(groupId, expenseId, locale) : Promise.resolve(""),
    getGroupPaymentMethods(groupId),
    getExpensePayerMethods(
      groupId,
      expense.payers.map((p) => p.userId),
    ),
    showPayFromBudget ? getUnallocatedSurplus(groupId) : Promise.resolve(0),
  ]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact showRefresh refreshGroupId={groupId} />
      <h1 className="mt-6 text-2xl font-bold">{expense.title}</h1>
      <p className="text-ink/60">
        {formatMoney(expense.amount, expense.group.currency, locale)} · {expense.activity.title}
        {expense.isSealed ? ` · ${t("expense.sealed")}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        <Link href={`/groups/${groupId}/reports?expenseId=${expense.id}`} className="text-teal">
          {t("nav.reports")}
        </Link>
        {expense.activity.status === "open" && (admin || expense.createdById === user.id) && (
          <Link href={`/groups/${groupId}/expenses/${expense.id}/edit`} className="text-teal">
            {t("expense.edit")}
          </Link>
        )}
      </div>
      {expense.approvalStatus !== "approved" && (
        <p className="mt-2 text-amber">{t("group.pending")}</p>
      )}
      {expense.notes && <p className="mt-3 text-sm">{expense.notes}</p>}
      {expense.receiptUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={expense.receiptUrl} alt="" className="mt-3 max-h-48 rounded-xl object-contain" />
      )}

      <div className="mt-5">
        <div className="card p-4">
          <div className="text-xs text-ink/50">{t("group.due")}</div>
          <div className="text-lg font-bold">
            {formatMoney(myDue, expense.group.currency, locale)}
          </div>
        </div>
      </div>

      {unpaid && countsForMe && expense.approvalStatus === "approved" && (
        <div className="card mt-4 p-4">
          <div className="text-sm text-ink/60">{t("expense.payHint")}</div>
          <div className="text-2xl font-bold text-teal">
            {formatMoney(suggestion, expense.group.currency, locale)}
          </div>
          <Link
            href={`/groups/${groupId}/payments/new?activityId=${expense.activityId}&expenseId=${expense.id}&amount=${suggestion}`}
            className="btn btn-primary mt-3 w-full"
          >
            {t("expense.pay")}
          </Link>
          {showPayFromBudget && (
            <PayFromBudgetForm
              groupId={groupId}
              expenseId={expense.id}
              currency={expense.group.currency}
              budgetAmount={unallocated}
            />
          )}
        </div>
      )}

      <h2 className="mt-6 font-bold">{t("expense.payers")}</h2>
      <div className="mt-2 space-y-2">
        {expense.payers.length === 0 && budgetAllocations.length === 0 && (
          <p className="text-sm text-ink/50">{t("expense.nonePaid")}</p>
        )}
        {expense.payers.map((p) => (
          <div key={p.id} className="flex justify-between text-sm">
            <span>{p.user.name}</span>
            <span>{formatMoney(p.amount, expense.group.currency, locale)}</span>
          </div>
        ))}
        {budgetAllocations.map((a) => (
          <div key={a.id} className="flex justify-between text-sm">
            <span>
              {a.payment?.payer?.name ?? t("nav.payments")}
              <span className="text-ink/40"> · {t("expense.fromBudget")}</span>
            </span>
            <span>{formatMoney(a.amount, expense.group.currency, locale)}</span>
          </div>
        ))}
      </div>

      {admin && (
        <div className="mt-4 space-y-2 text-sm">
          {members.map((mem) => {
            const share = expense.shares.find((s) => s.userId === mem.userId);
            if (!share) return null;
            const inPeriod = wasMemberAt(mem.invitedAt, expense.createdAt);
            return (
              <div key={mem.userId} className="flex justify-between rounded-xl bg-white/70 px-3 py-2">
                <span>{mem.user.name}</span>
                {inPeriod ? (
                  <span>
                    {t("group.shareDue")}{" "}
                    {formatMoney(
                      remainingDueOnExpense(
                        share.dueAmount,
                        allocatedFromUser(
                          expense.allocations.map((a) => ({
                            amount: a.amount,
                            payerUserId: a.payment?.payerUserId,
                          })),
                          mem.userId,
                        ),
                      ),
                      expense.group.currency,
                      locale,
                    )}
                  </span>
                ) : (
                  <span className="text-ink/40">{t("group.beforeJoin")}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(methods.length > 0 || userMethods.length > 0) && (
        <div className="card mt-5 p-4 text-sm">
          <div className="font-semibold">{t("payment.methods")}</div>
          {[...methods, ...userMethods].map((m) => (
            <div key={m.id} className="mt-2 border-t border-line pt-2">
              <div>{m.label}</div>
              {m.iban && (
                <div dir="ltr">
                  {t("payment.iban")}: {m.iban}
                </div>
              )}
              {m.beneficiaryName && <div>{m.beneficiaryName}</div>}
              {m.linkUrl && (
                <a className="text-teal" href={m.linkUrl}>
                  {m.linkUrl}
                </a>
              )}
              {m.qrImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.qrImageUrl} alt="" className="mt-2 h-28 w-28 object-contain" />
              )}
            </div>
          ))}
        </div>
      )}

      {admin && expense.approvalStatus === "pending" && (
        <form action={setExpenseApproval as ServerFormAction} className="mt-4 flex gap-2">
          <input type="hidden" name="expenseId" value={expense.id} />
          <button name="status" value="approved" className="btn btn-primary">
            {t("expense.approve")}
          </button>
          <button name="status" value="rejected" className="btn btn-ghost">
            {t("expense.reject")}
          </button>
        </form>
      )}

      {admin && (
        <div className="mt-6">
          <RemindForm
            groupId={groupId}
            targetType="expense"
            targetId={expense.id}
            defaultBody={template}
            collect
          />
        </div>
      )}
      {admin && !expense.isSealed && (
        <div className="mt-6">
          <DeleteRecordButton
            action={deleteExpense}
            hidden={{ expenseId: expense.id }}
            label={t("expense.delete")}
            confirmMessage={t("common.confirmDelete")}
            redirectTo={`/groups/${groupId}/activities/${expense.activityId}`}
          />
        </div>
      )}
      <BottomNav />
    </div>
  );
}
