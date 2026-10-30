import { getLocale, getTranslations } from "next-intl/server";
import { GroupPage, Section } from "@/components/page";
import { formatDay } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { computeGroupLedger } from "@/server/group-ledger";
import { pageGroup } from "@/server/guard";

export default async function ReportsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const access = pageGroup(groupId);
  const [{ group }, ledgerOrNull, t, locale] = await Promise.all([
    access,
    computeGroupLedger(groupId, access.then((a) => a.group)),
    getTranslations(),
    getLocale(),
  ]);
  const ledger = ledgerOrNull!;
  const money = (v: number) => formatMoney(v, group.currency, locale);
  const names = new Map(group.members.map((m) => [m.userId, m.name]));
  const spent = ledger.activities.reduce((s, a) => s + a.total, 0);
  const paidIn = ledger.cash + spent;
  const exportUrl = (kind: string) => `/api/groups/${groupId}/export?kind=${kind}&locale=${locale}`;

  return (
    <GroupPage group={group}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Total label={t("report.spent")} value={money(spent)} />
        <Total label={t("report.paidIn")} value={money(paidIn)} />
        <Total label={t("ledger.cash")} value={money(ledger.cash)} />
      </div>

      <Section title={t("ledger.members")}>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-ink/50">
              <tr>
                <th className="px-3 py-2 text-start font-normal">{t("report.member")}</th>
                <th className="px-3 py-2 text-end font-normal">{t("ledger.paid")}</th>
                <th className="px-3 py-2 text-end font-normal">{t("ledger.due")}</th>
                <th className="px-3 py-2 text-end font-normal">{t("report.balance")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {group.members.map((m) => {
                const b = ledger.byUser[m.userId];
                return (
                  <tr key={m.userId}>
                    <td className="px-3 py-2">{m.name}</td>
                    <td className="px-3 py-2 text-end">{money(b.paid)}</td>
                    <td className="px-3 py-2 text-end">{money(b.due)}</td>
                    <td className={`px-3 py-2 text-end font-semibold ${b.balance >= 0 ? "text-teal" : "text-rose"}`}>
                      {money(b.balance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={t("report.byActivity")}>
        <div className="space-y-2">
          {ledger.activities.map((a) => {
            const split = ledger.byActivity[a.id];
            return (
              <details key={a.id} className="card p-4 text-sm">
                <summary className="flex cursor-pointer items-center justify-between">
                  <span className="font-medium">
                    {a.title} <span className="text-xs text-ink/50">· {formatDay(a.startsOn, locale)}</span>
                  </span>
                  <span>{money(a.total)}</span>
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {Object.entries(split.dues).map(([userId, due]) => (
                    <li key={userId} className="flex justify-between">
                      <span>{names.get(userId)}</span>
                      <span>{money(due)}</span>
                    </li>
                  ))}
                  {split.unassigned !== 0 && (
                    <li className="flex justify-between text-amber">
                      <span>{t("report.unassigned")}</span>
                      <span>{money(split.unassigned)}</span>
                    </li>
                  )}
                </ul>
              </details>
            );
          })}
        </div>
      </Section>

      <Section title={t("report.export")}>
        <div className="grid grid-cols-2 gap-2">
          <a className="btn btn-ghost text-sm" href={exportUrl("summary")}>
            {t("report.exportSummary")}
          </a>
          <a className="btn btn-ghost text-sm" href={exportUrl("transactions")}>
            {t("report.exportTransactions")}
          </a>
        </div>
      </Section>
    </GroupPage>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] text-ink/50">{label}</div>
      <div className="mt-1 text-sm font-bold">{value}</div>
    </div>
  );
}
