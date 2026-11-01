import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/routing";
import { PrintButton } from "@/components/print-button";
import { fromMinor } from "@/lib/money";
import { computeGroupLedger } from "@/server/group-ledger";
import { pageGroup } from "@/server/guard";
import { loadActivity } from "@/server/queries";

export default async function ActivityStatement({
  params,
}: {
  params: Promise<{ groupId: string; activityId: string }>;
}) {
  const { groupId, activityId } = await params;
  const access = pageGroup(groupId);
  const [{ group }, activity, ledger, t, locale] = await Promise.all([
    access,
    loadActivity(groupId, activityId),
    computeGroupLedger(groupId, access.then((a) => a.group)),
    getTranslations(),
    getLocale(),
  ]);
  if (!activity || !ledger) notFound();

  const names = new Map(group.members.map((m) => [m.userId, m.name]));
  const contributions = new Map<string, number>();
  for (const p of activity.payments) {
    if (!p.approvedAt || p.payeeId) continue;
    contributions.set(p.payerId, (contributions.get(p.payerId) ?? 0) + p.amount);
  }
  const people = [...contributions.entries()].map(([userId, amount]) => ({
    name: names.get(userId) ?? "",
    amount,
  }));
  const expenses = activity.expenses.filter((e) => e.approvedAt);
  const collected = people.reduce((s, p) => s + p.amount, 0);
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const gap = collected - spent;
  const plain = (v: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(fromMinor(v, group.currency));
  const day = activity.startsOn;
  const date = `${day.getUTCDate()} / ${day.getUTCMonth() + 1} / ${day.getUTCFullYear()}`;
  const rows = Math.max(people.length, expenses.length);

  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-[#f4f1ea] px-5 py-6 text-[#1c1917] print:max-w-none print:bg-[#f4f1ea]">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/groups/${groupId}/activities/${activityId}`} className="text-sm text-[#1f6b4a]">
          {activity.title}
        </Link>
        <PrintButton label={t("report.exportPdf")} />
      </div>

      <header className="border-b border-[#1f6b4a]/30 pb-3 text-center">
        <h1 className="text-xl font-bold text-[#1f6b4a]">
          {t("report.pdfTitle")} {activity.title}
        </h1>
        <p className="mt-1 text-xs text-[#1f6b4a]/80">{t("report.pdfHint")}</p>
        <p className="mt-2 text-sm text-[#1c1917]/70" dir="ltr">
          {date}
        </p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
        <Column title={t("report.contributions")}>
          {Array.from({ length: rows }, (_, i) => people[i]).map((row, i) => (
            <Line key={i} label={row?.name} amount={row ? plain(row.amount) : ""} />
          ))}
        </Column>
        <Column title={t("report.expenses")}>
          {Array.from({ length: rows }, (_, i) => expenses[i]).map((row, i) => (
            <Line key={i} label={row?.title} amount={row ? plain(row.amount) : ""} />
          ))}
        </Column>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Pill label={t("report.totalIn")} amount={plain(collected)} />
        <Pill label={t("report.totalOut")} amount={plain(spent)} />
      </div>

      <div className={`mt-4 rounded-xl px-4 py-3 text-white ${gap >= 0 ? "bg-[#1f7a4d]" : "bg-rose"}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">{gap >= 0 ? t("report.surplus") : t("report.deficit")}</span>
          <span className="text-lg font-bold" dir="ltr">
            {plain(Math.abs(gap))} {group.currency === "SAR" && locale === "ar" ? "ريال" : group.currency}
          </span>
        </div>
      </div>
      <div className={`mt-2 rounded-xl px-4 py-3 text-white ${ledger.cash >= 0 ? "bg-[#1f7a4d]" : "bg-rose"}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">
            {t("ledger.cash")}
            <span className="mt-0.5 block text-xs font-normal text-white/80" dir="ltr">
              {new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date())}
            </span>
          </span>
          <span className="text-lg font-bold" dir="ltr">
            {plain(ledger.cash)} {group.currency === "SAR" && locale === "ar" ? "ريال" : group.currency}
          </span>
        </div>
      </div>
    </main>
  );
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-center text-sm font-semibold text-[#1f6b4a]">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Line({ label, amount }: { label?: string; amount: string }) {
  if (!label) return <div className="h-6" />;
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-dotted border-[#1c1917]/15 pb-1">
      <span className="min-w-0 truncate">{label}</span>
      <span dir="ltr">{amount}</span>
    </div>
  );
}

function Pill({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-[#e5f2ea] px-3 py-2 text-[#1f6b4a]">
      <span className="font-medium">{label}</span>
      <span className="font-bold" dir="ltr">
        {amount}
      </span>
    </div>
  );
}
