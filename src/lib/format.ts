import type { SplitRule } from "./ledger";
import { formatMoney, fromMinor } from "./money";

/** "2 shares", "25%", "SAR 50.00". Returns null when no rule. */
export function ruleText(
  rule: SplitRule,
  currency: string,
  locale: string,
  t: (key: "sharesN" | "percentN", values: { n: string }) => string,
): string | null {
  if (!rule) return null;
  if (rule.method === "amount") return formatMoney(rule.value, currency, locale);
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(rule.value);
  return rule.method === "shares" ? t("sharesN", { n }) : t("percentN", { n });
}

/** Rule value as typed in the form (amounts back in major units). */
export function ruleInput(rule: SplitRule, currency: string) {
  if (!rule) return { method: null, value: null };
  return { method: rule.method, value: String(rule.method === "amount" ? fromMinor(rule.value, currency) : rule.value) };
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function formatDay(d: Date, locale: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
