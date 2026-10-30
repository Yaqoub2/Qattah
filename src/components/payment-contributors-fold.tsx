"use client";

import { loadPaymentContributors } from "@/actions/workspace";
import { formatMoney } from "@/lib/money";
import type { Contributor } from "@/lib/contributors";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function PaymentContributorsFold({
  groupId,
  activityId,
  currency,
  locale,
}: {
  groupId: string;
  activityId?: string;
  currency: string;
  locale: string;
}) {
  const t = useTranslations();
  const [items, setItems] = useState<Contributor[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function onToggle(open: boolean) {
    if (!open || items || loading) return;
    setLoading(true);
    try {
      setItems(await loadPaymentContributors(groupId, activityId, t("payment.anonymous")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <details
      className="card mt-5"
      onToggle={(e) => onToggle(e.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none px-4 py-3 font-bold marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="fold-arrow me-2 inline-block text-ink/35 transition-transform">▸</span>
        {t("group.contributors")}
      </summary>
      <div className="space-y-2 px-4 pb-4">
        {loading && (
          <div className="flex justify-center py-3 text-ink/40">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}
        {items && items.length === 0 && <p className="text-sm text-ink/50">{t("group.noContributors")}</p>}
        {items?.map((c) => (
          <div key={c.key} className="flex items-center justify-between text-sm">
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-[11px] text-ink/45">
                {c.kind === "budget"
                  ? t("group.budgetSurplus")
                  : c.kind === "payer"
                    ? t("expense.payers")
                    : t("nav.payments")}
              </div>
            </div>
            <div className="font-semibold">{formatMoney(c.amount, currency, locale)}</div>
          </div>
        ))}
      </div>
    </details>
  );
}
