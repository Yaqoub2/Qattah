"use client";

import { createExpense, updateExpense } from "@/actions/expenses";
import { SubmitButton } from "./forms";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { fromMinor, toMinor } from "@/lib/money";
import { KafuMark } from "@/components/kafu-mark";

type Member = {
  userId: string;
  name: string;
  isPayingUser: boolean;
  defaultShare: number;
  defaultPercentage: number | null;
  defaultAmount: number | null;
};

type Split = "equal" | "shares" | "percentage" | "amount";

export function ExpenseForm({
  groupId,
  activityId,
  currency,
  defaultSplit,
  members,
  showKafu = false,
  expenseId,
  initial,
  budgetAmount = 0,
}: {
  groupId: string;
  activityId: string;
  currency: string;
  defaultSplit: Split;
  members: Member[];
  showKafu?: boolean;
  expenseId?: string;
  budgetAmount?: number;
  initial?: {
    title: string;
    amountMajor: string;
    notes: string;
    splitMethod: Split;
    included: Record<string, boolean>;
    weights: Record<string, number>;
    pcts: Record<string, number>;
    amts: Record<string, number>;
    payers: { userId: string; major: string }[];
    isSealed: boolean;
  };
}) {
  const t = useTranslations("expense");
  const tg = useTranslations("group");
  const te = useTranslations("errors");
  const router = useRouter();
  const amountLocked = Boolean(initial?.isSealed);
  const [splitMethod, setSplitMethod] = useState<Split>(initial?.splitMethod ?? defaultSplit);
  const [included, setIncluded] = useState<Record<string, boolean>>(
    initial?.included ?? Object.fromEntries(members.map((m) => [m.userId, true])),
  );
  const [weights, setWeights] = useState<Record<string, number>>(
    initial?.weights ?? Object.fromEntries(members.map((m) => [m.userId, m.defaultShare])),
  );
  const [pcts, setPcts] = useState<Record<string, number>>(
    initial?.pcts ?? Object.fromEntries(members.map((m) => [m.userId, m.defaultPercentage ?? 0])),
  );
  const [amts, setAmts] = useState<Record<string, number>>(
    initial?.amts ?? Object.fromEntries(members.map((m) => [m.userId, m.defaultAmount ?? 0])),
  );
  const [payers, setPayers] = useState<{ userId: string; major: string }[]>(initial?.payers ?? []);
  const [sealed, setSealed] = useState(Boolean(initial?.isSealed));
  const [fromBudget, setFromBudget] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const includedIds = useMemo(
    () => members.filter((m) => included[m.userId]).map((m) => m.userId),
    [members, included],
  );

  async function action(formData: FormData) {
    setError(null);
    formData.set("includedIds", JSON.stringify(includedIds));
    formData.set("shareWeights", JSON.stringify(weights));
    formData.set("percentages", JSON.stringify(pcts));
    const amountOverrides: Record<string, number> = {};
    for (const m of members) {
      if (amts[m.userId]) amountOverrides[m.userId] = amts[m.userId];
    }
    formData.set("amountOverrides", JSON.stringify(amountOverrides));
    formData.set(
      "payers",
      JSON.stringify(
        payers
          .map((p) => ({ userId: p.userId, amount: toMinor(Number(p.major) || 0, currency) }))
          .filter((p) => p.amount > 0),
      ),
    );
    const res = expenseId ? await updateExpense(formData) : await createExpense(formData);
    if (!res.ok) {
      setError(te.has(res.error as never) ? te(res.error as never) : res.error);
      return;
    }
    router.push(expenseId ? `/groups/${groupId}/expenses/${expenseId}` : `/groups/${groupId}/activities/${activityId}`);
    router.refresh();
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="activityId" value={activityId} />
      {expenseId && <input type="hidden" name="expenseId" value={expenseId} />}
      <label className="block space-y-1 text-sm">
        <span>{t("title")}</span>
        <input name="title" className="field" required defaultValue={initial?.title} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>
          {t("amount")} ({currency})
        </span>
        {amountLocked && <input type="hidden" name="amount" value={initial?.amountMajor ?? ""} />}
        <input
          name={amountLocked ? undefined : "amount"}
          className="field"
          inputMode="decimal"
          required={!amountLocked}
          disabled={amountLocked}
          defaultValue={initial?.amountMajor}
        />
        {amountLocked && <p className="text-xs text-ink/50">{t("amountLocked")}</p>}
      </label>
      <label className="flex items-start gap-2 text-sm">
        {amountLocked && <input type="hidden" name="isSealed" value="on" />}
        <input
          type="checkbox"
          name={amountLocked ? undefined : "isSealed"}
          checked={sealed}
          disabled={amountLocked}
          onChange={(e) => setSealed(e.target.checked)}
        />
        <span>
          {t("sealed")}
          <span className="mt-0.5 block text-xs text-ink/50">{t("sealedHint")}</span>
        </span>
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t("notes")}</span>
        <textarea name="notes" className="field min-h-20" defaultValue={initial?.notes} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t("receipt")}</span>
        <input name="receipt" type="file" accept="image/*,application/pdf" className="field" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t("split")}</span>
        <select
          name="splitMethod"
          className="field"
          value={splitMethod}
          disabled={amountLocked}
          onChange={(e) => setSplitMethod(e.target.value as Split)}
        >
          <option value="equal">{tg("equal")}</option>
          <option value="shares">{tg("shares")}</option>
          <option value="percentage">{tg("percentage")}</option>
          <option value="amount">{tg("amount")}</option>
        </select>
      </label>

      <div className="card p-3">
        <div className="mb-2 text-sm font-semibold">{t("included")}</div>
        {members.map((m) => (
          <div key={m.userId} className="flex items-center gap-2 border-b border-line/60 py-2 text-sm last:border-0">
            <input
              type="checkbox"
              checked={!!included[m.userId]}
              disabled={amountLocked}
              onChange={(e) => setIncluded({ ...included, [m.userId]: e.target.checked })}
            />
            <div className="flex flex-1 items-center gap-2">
              <span>{m.name}</span>
              {showKafu && <KafuMark active={m.isPayingUser} />}
            </div>
            {splitMethod === "shares" && (
              <input
                className="field !min-h-9 w-16"
                type="number"
                disabled={amountLocked}
                value={weights[m.userId]}
                onChange={(e) => setWeights({ ...weights, [m.userId]: Number(e.target.value) })}
              />
            )}
            {splitMethod === "percentage" && (
              <input
                className="field !min-h-9 w-16"
                type="number"
                disabled={amountLocked}
                value={pcts[m.userId]}
                onChange={(e) => setPcts({ ...pcts, [m.userId]: Number(e.target.value) })}
              />
            )}
            {splitMethod === "amount" && (
              <input
                className="field !min-h-9 w-24"
                type="number"
                disabled={amountLocked}
                value={fromMinor(amts[m.userId] ?? 0, currency)}
                onChange={(e) =>
                  setAmts({ ...amts, [m.userId]: toMinor(Number(e.target.value) || 0, currency) })
                }
              />
            )}
          </div>
        ))}
      </div>

      <div className="card p-3">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold">
          <span>{t("payers")}</span>
          <button
            type="button"
            className="text-teal"
            onClick={() => setPayers([...payers, { userId: members[0]?.userId ?? "", major: "" }])}
          >
            {t("addPayer")}
          </button>
        </div>
        <p className="mb-2 text-xs text-ink/50">{t("nonePaid")}</p>
        {payers.map((p, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <select
              className="field"
              value={p.userId}
              onChange={(e) => {
                const next = [...payers];
                next[i] = { ...p, userId: e.target.value };
                setPayers(next);
              }}
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              className="field w-28"
              placeholder={currency}
              value={p.major}
              onChange={(e) => {
                const next = [...payers];
                next[i] = { ...p, major: e.target.value };
                setPayers(next);
              }}
            />
            <button
              type="button"
              className="btn btn-ghost !min-h-9 shrink-0 px-3 text-xs text-rose"
              onClick={() => setPayers(payers.filter((_, idx) => idx !== i))}
            >
              {t("removePayer")}
            </button>
          </div>
        ))}
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="fromBudget"
            checked={fromBudget}
            onChange={(e) => setFromBudget(e.target.checked)}
          />
          <span>
            {t("fromBudget")}
            <span className="mt-0.5 block text-xs text-ink/50">{t("fromBudgetHint")}</span>
            {budgetAmount > 0 && (
              <span className="mt-0.5 block text-xs text-teal">
                {fromMinor(budgetAmount, currency)} {currency}
              </span>
            )}
          </span>
        </label>
      </div>
      {error && <p className="text-sm text-rose">{error}</p>}
      <SubmitButton>{expenseId ? t("save") : t("create")}</SubmitButton>
    </form>
  );
}
