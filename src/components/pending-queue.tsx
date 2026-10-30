import { getTranslations } from "next-intl/server";
import { approveEntry } from "@/actions/approvals";
import { deleteExpense } from "@/actions/activities";
import { deletePayment } from "@/actions/payments";
import { formatMoney } from "@/lib/money";
import type { listPending } from "@/server/queries";
import { ActionForm, Hidden, SubmitButton } from "./forms";
import { Section } from "./page";
import { ReceiptLink } from "./receipt";

type Pending = Awaited<ReturnType<typeof listPending>>;

/** Admin-only list of member submissions. Approve makes it count; reject deletes it. */
export async function PendingQueue({
  groupId,
  pending,
  names,
  currency,
  locale,
  receipts,
}: {
  groupId: string;
  pending: Pending;
  names: Map<string, string>;
  currency: string;
  locale: string;
  receipts: Map<string, string>;
}) {
  const t = await getTranslations();
  const rows = [
    ...pending.expenses.map((e) => ({
      kind: "expense" as const,
      id: e.id,
      amount: e.amount,
      title: `${e.title} · ${e.activity.title}`,
      by: e.createdById,
      receipt: e.receiptPath,
    })),
    ...pending.payments.map((p) => ({
      kind: "payment" as const,
      id: p.id,
      amount: p.amount,
      title: `${names.get(p.payerId)} → ${p.payeeId ? names.get(p.payeeId) : t("payment.toGroup")}${p.activity ? ` · ${p.activity.title}` : ""}`,
      by: p.createdById,
      receipt: p.receiptPath,
    })),
  ];
  if (rows.length === 0) return null;

  return (
    <Section title={`${t("approval.title")} (${rows.length})`}>
      <ul className="card divide-y divide-line border-amber/40">
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">
                <span className="text-xs text-amber">{r.kind === "expense" ? t("approval.expense") : t("approval.payment")}</span>{" "}
                {r.title}
              </span>
              <span className="shrink-0 font-semibold">{formatMoney(r.amount, currency, locale)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-xs">
              <span className="text-ink/50">
                {t("approval.by")} {names.get(r.by)}
                {r.receipt && receipts.get(r.receipt) && (
                  <>
                    {" · "}
                    <ReceiptLink url={receipts.get(r.receipt)!} />
                  </>
                )}
              </span>
              <span className="flex items-center gap-4">
                <ActionForm
                  action={r.kind === "expense" ? deleteExpense : deletePayment}
                  className=""
                  confirm={t("approval.confirmReject")}
                >
                  <Hidden values={r.kind === "expense" ? { groupId, expenseId: r.id } : { groupId, paymentId: r.id }} />
                  <SubmitButton className="text-rose">{t("approval.reject")}</SubmitButton>
                </ActionForm>
                <ActionForm action={approveEntry} className="">
                  <Hidden values={{ groupId, id: r.id, kind: r.kind }} />
                  <SubmitButton className="font-semibold text-teal">{t("approval.approve")}</SubmitButton>
                </ActionForm>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
