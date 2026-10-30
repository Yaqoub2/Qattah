import { formatMoney } from "@/lib/money";
import type { Contributor } from "@/lib/contributors";
import { getTranslations } from "next-intl/server";

export async function ContributorList({
  items,
  currency,
  locale,
}: {
  items: Contributor[];
  currency: string;
  locale: string;
}) {
  const t = await getTranslations();
  if (items.length === 0) {
    return (
      <div className="card mt-5 p-4">
        <h2 className="font-bold">{t("group.contributors")}</h2>
        <p className="mt-2 text-sm text-ink/50">{t("group.noContributors")}</p>
      </div>
    );
  }
  return (
    <div className="card mt-5 p-4">
      <h2 className="font-bold">{t("group.contributors")}</h2>
      <div className="mt-3 space-y-2">
        {items.map((c) => (
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
    </div>
  );
}
