import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { Link } from "@/i18n/routing";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { isAdminRole } from "@/lib/quota";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { allocatedFromUser, collectedOf, remainingDueOnExpense } from "@/lib/ledger";
import { PrintButton } from "@/components/print-button";
import { KafuMark } from "@/components/kafu-mark";
import { removeMember, updateMember } from "@/actions/groups";
import { ServerFormAction } from "@/lib/utils";
import { SubmitButton } from "@/components/forms";
import {
  getGroupExpenses,
  getGroupMemberPaymentMethods,
  getGroupMembers,
  getGroupMembership,
  getGroupPayments,
} from "@/lib/workspace";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ groupId: string; userId: string }>;
}) {
  const user = await requirePageUser();
  const { groupId, userId } = await params;
  const membership = await getGroupMembership(groupId, user.id);
  if (!membership) notFound();
  const admin = isAdminRole(membership.role);
  const [members, expenses, payments, methods] = await Promise.all([
    getGroupMembers(groupId),
    getGroupExpenses(groupId),
    getGroupPayments(groupId),
    getGroupMemberPaymentMethods(groupId),
  ]);
  const mem = members.find((m) => m.userId === userId);
  if (!mem) notFound();

  const t = await getTranslations("group");
  const tr = await getTranslations("report");
  const locale = await getLocale();
  const currency = membership.group.currency;
  const labels = methods.filter((m) => m.userId === userId).map((m) => m.label);

  const memberPayments = payments.filter(
    (p) => p.payerUserId === userId && (admin || p.approvalStatus === "approved" || p.payerUserId === user.id),
  );
  const memberExpenses = expenses.filter((e) => {
    if (e.approvalStatus !== "approved" && !admin) return false;
    return (
      e.shares.some((s) => s.userId === userId && s.included) ||
      e.payers.some((p) => p.userId === userId) ||
      e.allocations.some((a) => a.payment?.payerUserId === userId)
    );
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact showRefresh refreshGroupId={groupId} />
      <Link href={`/groups/${groupId}/members`} className="no-print mt-4 text-sm text-teal">
        ← {t("membersTitle")}
      </Link>
      <h1 className="mt-3 text-2xl font-bold">{mem.user.name}</h1>
      <p className="text-sm text-ink/50">
        {tr("member")} · {membership.group.name}
      </p>

      <div className="no-print mt-3 flex flex-wrap gap-2">
        <a
          className="btn btn-primary text-sm"
          href={`/api/groups/${groupId}/export?format=xlsx&userId=${userId}`}
        >
          {tr("exportXlsx")}
        </a>
        <PrintButton label={tr("print")} />
      </div>

      <div className="card mt-4 space-y-1 p-4 text-sm">
        <div className="flex items-center gap-2 text-base font-semibold">
          {mem.user.name}
          {admin && <KafuMark active={mem.isPayingUser} />}
        </div>
        {mem.user.phone && (
          <div dir="ltr">
            {t("phone")}: {mem.user.phone}
          </div>
        )}
        {mem.user.email && (
          <div dir="ltr">
            {t("email")}: {mem.user.email}
          </div>
        )}
        <div>
          {t("paymentMethods")}: {labels.length ? labels.join(" · ") : t("noPaymentMethods")}
        </div>
        <div>
          {t("invitedAt")}: {formatDateTime(mem.invitedAt, locale) ?? "—"}
        </div>
        <div>
          {t("firstEnteredAt")}: {formatDateTime(mem.firstEnteredAt, locale) ?? t("neverEntered")}
        </div>
        {admin && (
          <>
            <div>
              {t("role")}: {t(mem.role)}
            </div>
            <div>
              {t("status")}: {t(`userStatus.${mem.user.status}`)}
            </div>
            <div>
              {t("paying")}: {mem.isPayingUser ? t("kafu") : t("notPaying")}
            </div>
            <div>
              {t("share")}: {mem.defaultShare}
              {mem.defaultPercentage != null ? ` · ${mem.defaultPercentage}%` : ""}
            </div>
          </>
        )}
        {(admin || mem.userId === user.id) && (
          <>
            <div>
              {tr("colNet")}: {formatMoney(mem.netAmount, currency, locale)}
            </div>
            <div>
              {t("due")}: {formatMoney(mem.dueAmount, currency, locale)}
            </div>
            <div>
              {tr("paid")}: {formatMoney(mem.paidAmount, currency, locale)}
            </div>
          </>
        )}
      </div>

      <h2 className="mt-6 font-bold">{tr("payments")}</h2>
      <div className="mt-2 space-y-2">
        {memberPayments.length === 0 && <p className="text-sm text-ink/50">{t("noMemberPayments")}</p>}
        {memberPayments.map((p) => (
          <div key={p.id} className="card flex justify-between p-3 text-sm">
            <span>
              {formatDateTime(p.paidAt, locale)}
              {p.approvalStatus !== "approved" ? ` · ${t("pending")}` : ""}
            </span>
            <span>{formatMoney(p.amount, currency, locale)}</span>
          </div>
        ))}
      </div>

      <h2 className="mt-6 font-bold">{tr("expenses")}</h2>
      <div className="mt-2 space-y-2">
        {memberExpenses.length === 0 && <p className="text-sm text-ink/50">{t("noMemberExpenses")}</p>}
        {memberExpenses.map((e) => {
          const share = e.shares.find((s) => s.userId === userId);
          const collected = collectedOf(e);
          const remaining = remainingDueOnExpense(
            share?.dueAmount ?? 0,
            allocatedFromUser(
              e.allocations.map((a) => ({ amount: a.amount, payerUserId: a.payment?.payerUserId })),
              userId,
            ),
          );
          return (
            <Link key={e.id} href={`/groups/${groupId}/expenses/${e.id}`} className="card block p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span>
                  {e.title}
                  {e.approvalStatus !== "approved" ? ` · ${t("pending")}` : ""}
                </span>
                <span>{formatMoney(e.amount, currency, locale)}</span>
              </div>
              {share && (
                <div className="mt-1 text-xs text-ink/50">
                  {t("shareDue")} {formatMoney(remaining, currency, locale)} · {t("collected")}{" "}
                  {formatMoney(collected, currency, locale)}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {admin && (
        <form action={updateMember as ServerFormAction} className="card no-print mt-8 space-y-2 p-4 text-sm">
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="userId" value={userId} />
          <select name="role" className="field" defaultValue={mem.role}>
            <option value="member">{t("member")}</option>
            <option value="admin">{t("admin")}</option>
            {mem.role === "owner" && <option value="owner">{t("owner")}</option>}
          </select>
          <KafuMark withCheckbox defaultChecked={mem.isPayingUser} />
          <SubmitButton>{t("save")}</SubmitButton>
        </form>
      )}
      {admin && mem.role !== "owner" && (
        <form action={removeMember as ServerFormAction} className="no-print mt-3">
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="userId" value={userId} />
          <button className="text-sm text-rose">{t("remove")}</button>
        </form>
      )}
      <div className="no-print">
        <BottomNav />
      </div>
    </div>
  );
}
