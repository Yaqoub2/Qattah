import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { Field, SubmitButton } from "@/components/forms";
import { depositGroupBudget, updateGroupSettings } from "@/actions/groups";
import { copyUserMethodToGroup } from "@/actions/methods";
import { isAdminRole } from "@/lib/quota";
import { getTranslations, getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ServerFormAction } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { PaymentMethodManager } from "@/components/payment-method-manager";
import {
  getGroupLedgerCached,
  getGroupMemberPaymentMethods,
  getGroupMembers,
  getGroupMembership,
  getGroupPaymentMethods,
} from "@/lib/workspace";

export default async function SettingsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const user = await requirePageUser();
  const { groupId } = await params;
  const membership = await getGroupMembership(groupId, user.id);
  if (!membership || !isAdminRole(membership.role)) notFound();
  const t = await getTranslations("group");
  const tp = await getTranslations("payment");
  const locale = await getLocale();
  const [methods, members, memberMethods, ledger] = await Promise.all([
    getGroupPaymentMethods(groupId),
    getGroupMembers(groupId),
    getGroupMemberPaymentMethods(groupId),
    getGroupLedgerCached(groupId),
  ]);
  const ownerById = Object.fromEntries(members.map((m) => [m.userId, m.user.name]));

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact showRefresh refreshGroupId={groupId} />
      <h1 className="mt-6 text-2xl font-bold">{t("settingsTitle")}</h1>
      <form action={updateGroupSettings as ServerFormAction} className="card mt-4 space-y-3 p-4">
        <input type="hidden" name="groupId" value={groupId} />
        <Field name="name" label={t("name")} defaultValue={membership.group.name} required />
        <label className="block space-y-1 text-sm">
          <span>{t("currency")}</span>
          <select name="currency" className="field" defaultValue={membership.group.currency}>
            {["SAR", "AED", "KWD", "QAR", "BHD", "OMR", "USD", "EUR"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t("defaultSplit")}</span>
          <select
            name="defaultSplitMethod"
            className="field"
            defaultValue={membership.group.defaultSplitMethod}
          >
            <option value="equal">{t("equal")}</option>
            <option value="shares">{t("shares")}</option>
            <option value="percentage">{t("percentage")}</option>
            <option value="amount">{t("amount")}</option>
          </select>
        </label>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="membersCanSubmit" defaultChecked={membership.group.membersCanSubmit} />
          {t("membersCanSubmit")}
        </label>
        <SubmitButton>{t("save")}</SubmitButton>
      </form>

      <form action={depositGroupBudget as ServerFormAction} className="card mt-4 space-y-3 p-4">
        <input type="hidden" name="groupId" value={groupId} />
        <div>
          <div className="text-sm font-semibold">
            {ledger.budgetAmount >= 0 ? t("budgetSurplus") : t("budgetDeficit")}
          </div>
          <p className="text-xs text-ink/50">{t("budgetHint")}</p>
          <p className={`mt-1 font-bold ${ledger.budgetAmount >= 0 ? "text-teal" : "text-rose"}`}>
            {formatMoney(ledger.budgetAmount, membership.group.currency, locale)}
          </p>
        </div>
        <Field name="amount" label={t("depositBudget")} />
        <label className="block space-y-1 text-sm">
          <span>{t("budgetPayer")}</span>
          <select name="payerUserId" className="field" defaultValue={user.id}>
            {members.map((mem) => (
              <option key={mem.userId} value={mem.userId}>
                {mem.user.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-ink/50">{t("depositPending")}</p>
        <SubmitButton>{t("deposit")}</SubmitButton>
      </form>

      <h2 className="mt-8 font-bold">{tp("methods")}</h2>
      <div className="mt-3">
        <PaymentMethodManager
          methods={methods.map((m) => ({
            ...m,
            ownerName: m.sourceUserId ? ownerById[m.sourceUserId] : null,
          }))}
          groupId={groupId}
        />
      </div>

      {memberMethods.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold">{tp("copyFromMember")}</h3>
          {memberMethods.map((m) => (
            <form key={m.id} action={copyUserMethodToGroup as ServerFormAction} className="mt-2 flex items-center justify-between gap-3">
              <span className="text-sm">
                {tp("methodOf", { label: m.label, name: m.user.name })}
              </span>
              <input type="hidden" name="groupId" value={groupId} />
              <input type="hidden" name="methodId" value={m.id} />
              <button className="btn btn-ghost !min-h-9 shrink-0 text-xs">{tp("copy")}</button>
            </form>
          ))}
        </div>
      )}
      <BottomNav />
    </div>
  );
}
