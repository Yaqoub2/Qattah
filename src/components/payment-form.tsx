"use client";

import { payExpenseFromBudget } from "@/actions/expenses";
import { createPayment, updatePayment } from "@/actions/payments";
import { SubmitButton } from "./forms";
import { fromMinor, toMinor } from "@/lib/money";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { IdentifierChannel, type IdentifierMode } from "./identifier-channel";

type PayerKind = "member" | "guest" | "anonymous";

export function PaymentForm({
  groupId,
  currency,
  members,
  expenses,
  defaultPayer,
  defaultExpenseId,
  defaultAmountMinor,
  allowOutsidePayers = false,
  paymentId,
  defaultNotes,
  lockPayer = false,
  budgetAmount = 0,
}: {
  groupId: string;
  currency: string;
  members: { userId: string; name: string }[];
  expenses: { id: string; title: string; amount: number }[];
  defaultPayer: string;
  defaultExpenseId?: string;
  defaultAmountMinor?: number;
  allowOutsidePayers?: boolean;
  paymentId?: string;
  defaultNotes?: string;
  lockPayer?: boolean;
  budgetAmount?: number;
}) {
  const t = useTranslations("payment");
  const tg = useTranslations("group");
  const tex = useTranslations("expense");
  const te = useTranslations("errors");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [expenseId, setExpenseId] = useState(defaultExpenseId ?? "");
  const [fromBudget, setFromBudget] = useState(false);
  const [payerKind, setPayerKind] = useState<PayerKind>("member");
  const [mode, setMode] = useState<IdentifierMode>("phone");
  const [national, setNational] = useState("");
  const [email, setEmail] = useState("");
  const useBudget = fromBudget && !paymentId;

  async function action(formData: FormData) {
    setError(null);
    if (useBudget) {
      formData.set("expenseId", expenseId);
      const res = await payExpenseFromBudget(formData);
      if (!res.ok) {
        setError(te.has(res.error as never) ? te(res.error as never) : res.error);
        return;
      }
      router.push(expenseId ? `/groups/${groupId}/expenses/${expenseId}` : `/groups/${groupId}/payments/new`);
      router.refresh();
      return;
    }
    if (expenseId) {
      const amt = Number(String(formData.get("amount") ?? "").replace(",", "."));
      formData.set(
        "allocations",
        JSON.stringify([{ expenseId, amount: toMinor(amt || 0, currency) }]),
      );
    }
    const res = paymentId ? await updatePayment(formData) : await createPayment(formData);
    if (!res.ok) {
      setError(te.has(res.error as never) ? te(res.error as never) : res.error);
      return;
    }
    router.push(`/groups/${groupId}/payments/new`);
    router.refresh();
  }

  return (
    <form action={action} className="card space-y-3 p-4">
      <input type="hidden" name="groupId" value={groupId} />
      {paymentId && <input type="hidden" name="paymentId" value={paymentId} />}
      {allowOutsidePayers && !lockPayer && !useBudget && (
        <div className="block space-y-1 text-sm">
          <span>{t("payerKind")}</span>
          <input type="hidden" name="payerKind" value={payerKind} />
          <div
            role="radiogroup"
            aria-label={t("payerKind")}
            className="grid grid-cols-3 gap-1 rounded-2xl bg-white/70 p-1"
          >
            {(
              [
                ["member", t("payerMember")],
                ["guest", t("payerGuest")],
                ["anonymous", t("payerAnonymous")],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={payerKind === kind}
                className={`rounded-xl px-1 py-2 text-center text-xs font-semibold leading-tight sm:text-sm ${
                  payerKind === kind ? "bg-teal text-white" : "text-ink/60"
                }`}
                onClick={() => setPayerKind(kind)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!useBudget && (payerKind === "member" || lockPayer) && (
        <label className="block space-y-1 text-sm">
          <span>{t("payer")}</span>
          <select name="payerUserId" className="field" defaultValue={defaultPayer} disabled={lockPayer}>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          {lockPayer && <input type="hidden" name="payerUserId" value={defaultPayer} />}
          {lockPayer && <input type="hidden" name="payerKind" value="member" />}
        </label>
      )}
      {allowOutsidePayers && !lockPayer && !useBudget && payerKind === "guest" && (
        <div className="space-y-3">
          <p className="text-xs text-ink/50">{t("guestHint")}</p>
          <IdentifierChannel
            mode={mode}
            onModeChange={setMode}
            national={national}
            onNationalChange={setNational}
            email={email}
            onEmailChange={setEmail}
            labels={{
              phone: tg("phone"),
              email: tg("email"),
              phoneHint: tg("phoneHint"),
              phonePlaceholder: tg("phonePlaceholder"),
              phoneCanonical: (number) => tg("phoneCanonical", { number }),
            }}
          />
          <label className="block space-y-1 text-sm">
            <span>{t("guestName")}</span>
            <input name="guestName" className="field" required />
          </label>
        </div>
      )}
      {allowOutsidePayers && !lockPayer && !useBudget && payerKind === "anonymous" && (
        <p className="text-xs text-ink/50">{t("anonymousHint")}</p>
      )}
      {!useBudget && (
        <label className="block space-y-1 text-sm">
          <span>
            {t("amount")} ({currency})
          </span>
          <input
            name="amount"
            className="field"
            required
            defaultValue={
              defaultAmountMinor !== undefined ? String(fromMinor(defaultAmountMinor, currency)) : ""
            }
          />
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span>{t("allocate")}</span>
        <select
          className="field"
          value={expenseId}
          required={useBudget}
          onChange={(e) => {
            setExpenseId(e.target.value);
            if (!e.target.value) setFromBudget(false);
          }}
        >
          <option value="">—</option>
          {expenses.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </label>
      {!paymentId && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="fromBudget"
            checked={fromBudget}
            disabled={!expenseId}
            onChange={(e) => setFromBudget(e.target.checked)}
          />
          <span>
            {tex("fromBudget")}
            <span className="mt-0.5 block text-xs text-ink/50">{tex("fromBudgetHint")}</span>
            {budgetAmount > 0 && (
              <span className="mt-0.5 block text-xs text-teal">
                {fromMinor(budgetAmount, currency)} {currency}
              </span>
            )}
          </span>
        </label>
      )}
      {!useBudget && <p className="text-xs text-ink/50">{t("unallocatedHint")}</p>}
      {!useBudget && (
        <>
          <textarea name="notes" className="field min-h-20" placeholder={t("notes")} defaultValue={defaultNotes} />
          <input name="receipt" type="file" accept="image/*,application/pdf" className="field" />
        </>
      )}
      {error && <p className="text-sm text-rose">{error}</p>}
      {!useBudget && <p className="text-xs text-ink/50">{t("pendingHint")}</p>}
      <SubmitButton>{useBudget ? tex("fromBudget") : paymentId ? t("save") : t("submit")}</SubmitButton>
    </form>
  );
}

export function PayFromBudgetForm({
  groupId,
  expenseId,
  currency,
  budgetAmount,
}: {
  groupId: string;
  expenseId: string;
  currency: string;
  budgetAmount: number;
}) {
  const tex = useTranslations("expense");
  const te = useTranslations("errors");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res = await payExpenseFromBudget(formData);
    if (!res.ok) {
      setError(te.has(res.error as never) ? te(res.error as never) : res.error);
      return;
    }
    router.refresh();
  }

  return (
    <form action={action} className="mt-3 space-y-1">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="expenseId" value={expenseId} />
      <SubmitButton className="btn btn-ghost w-full">{tex("fromBudget")}</SubmitButton>
      <p className="text-xs text-ink/50">{tex("fromBudgetHint")}</p>
      {budgetAmount > 0 && (
        <p className="text-xs text-teal">
          {fromMinor(budgetAmount, currency)} {currency}
        </p>
      )}
      {error && <p className="text-sm text-rose">{error}</p>}
    </form>
  );
}
