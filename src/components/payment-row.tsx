import { getTranslations } from "next-intl/server";
import { deletePayment } from "@/actions/payments";
import { formatDay } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { ActionForm, Hidden, SubmitButton } from "./forms";
import { ReceiptLink } from "./receipt";

type Row = {
  id: string;
  payerId: string;
  payeeId: string | null;
  amount: number;
  paidOn: Date;
  note: string | null;
  approvedAt: Date | null;
  activity: { id: string; title: string } | null;
};

export async function PaymentRow({
  payment: p,
  names,
  currency,
  locale,
  groupId,
  canDelete,
  receiptUrl,
}: {
  payment: Row;
  names: Map<string, string>;
  currency: string;
  locale: string;
  groupId?: string;
  canDelete?: boolean;
  receiptUrl?: string;
}) {
  const t = await getTranslations();
  const to = p.payeeId ? names.get(p.payeeId) : t("payment.toGroup");
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">
          <span className="font-medium">{names.get(p.payerId)}</span>
          <span className="text-ink/50"> → {to}</span>
          {!p.approvedAt && <span className="text-xs text-amber"> · {t("approval.pending")}</span>}
        </span>
        <span className="shrink-0 font-semibold">{formatMoney(p.amount, currency, locale)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-ink/50">
        <span className="min-w-0 truncate">
          {formatDay(p.paidOn, locale)}
          {p.activity && ` · ${p.activity.title}`}
          {p.note && ` · ${p.note}`}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {receiptUrl && <ReceiptLink url={receiptUrl} />}
          {canDelete && groupId && (
            <ActionForm action={deletePayment} className="" confirm={t("payment.confirmDelete")}>
              <Hidden values={{ groupId, paymentId: p.id }} />
              <SubmitButton className="text-rose">{t("common.delete")}</SubmitButton>
            </ActionForm>
          )}
        </span>
      </div>
    </li>
  );
}
