import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { createActivity } from "@/actions/activities";
import { ActionForm, Field, Hidden, SubmitButton } from "@/components/forms";
import { Empty, Fold, GroupPage, Section } from "@/components/page";
import { sendReminder } from "@/actions/reminders";
import { REMINDER_COOLDOWN_HOURS } from "@/lib/limits";
import { formatDay, isoDay } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { computeGroupLedger } from "@/server/group-ledger";
import { pageGroup } from "@/server/guard";
import { PendingQueue } from "@/components/pending-queue";
import { listPending, recentlyReminded } from "@/server/queries";
import { signedUrls } from "@/server/storage";

export default async function GroupOverview({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const access = pageGroup(groupId);
  const [{ group, admin }, ledgerOrNull, t, locale] = await Promise.all([
    access,
    computeGroupLedger(groupId, access.then((a) => a.group)),
    getTranslations(),
    getLocale(),
  ]);
  const ledger = ledgerOrNull!;
  const [reminded, pending] = admin
    ? await Promise.all([recentlyReminded(groupId, REMINDER_COOLDOWN_HOURS), listPending(groupId)])
    : [new Set<string>(), { expenses: [], payments: [] }];
  const pendingReceipts = await signedUrls([...pending.expenses, ...pending.payments].map((r) => r.receiptPath));
  const names = new Map(group.members.map((m) => [m.userId, m.name]));
  const { activities } = ledger;
  const money = (v: number) => formatMoney(v, group.currency, locale);
  const mine = ledger.byUser[group.me.userId];

  return (
    <GroupPage group={group}>
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("ledger.paid")} value={money(mine.paid)} />
        <Stat label={t("ledger.due")} value={money(mine.due)} />
        <Stat
          label={mine.balance >= 0 ? t("ledger.credit") : t("ledger.owes")}
          value={money(Math.abs(mine.balance))}
          tone={mine.balance >= 0 ? "text-teal" : "text-rose"}
        />
      </div>

      {admin && (
        <PendingQueue
          groupId={groupId}
          pending={pending}
          names={names}
          currency={group.currency}
          locale={locale}
          receipts={pendingReceipts}
        />
      )}

      <Section title={t("ledger.members")} action={<span className="text-xs text-ink/50">{t("ledger.cash")}: {money(ledger.cash)}</span>}>
        <ul className="card divide-y divide-line">
          {group.members.map((m) => {
            const b = ledger.byUser[m.userId];
            return (
              <li key={m.userId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="text-xs text-ink/50">
                    {t("ledger.paid")} {money(b.paid)} · {t("ledger.due")} {money(b.due)}
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <div className={`font-semibold ${b.balance >= 0 ? "text-teal" : "text-rose"}`}>
                    {b.balance > 0 ? "+" : ""}
                    {money(b.balance)}
                  </div>
                  {admin && b.balance < 0 && m.userId !== group.me.userId &&
                    (reminded.has(m.userId) ? (
                      <span className="text-[11px] text-ink/40">{t("reminder.sent")}</span>
                    ) : (
                      <ActionForm action={sendReminder} className="">
                        <Hidden values={{ groupId, userId: m.userId }} />
                        <SubmitButton className="text-[11px] text-teal">{t("reminder.send")}</SubmitButton>
                      </ActionForm>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t("activity.title")}>
        {activities.length === 0 ? (
          <Empty>{t("activity.empty")}</Empty>
        ) : (
          <ul className="space-y-2">
            {activities.map((a) => {
              const split = ledger.byActivity[a.id];
              const warn = split.unset.length > 0 || split.unassigned !== 0;
              return (
                <li key={a.id}>
                  <Link href={`/groups/${groupId}/activities/${a.id}`} className="card block p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{a.title}</span>
                      <span className="text-sm">{money(a.total)}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-ink/50">
                      <span>
                        {formatDay(a.startsOn, locale)}
                        {a.closed && ` · ${t("activity.closed")}`}
                      </span>
                      <span>
                        {t("ledger.yourDue")} {money(split.dues[group.me.userId] ?? 0)}
                      </span>
                    </div>
                    {warn && <div className="mt-2 text-xs text-amber">{t("activity.needsAttention")}</div>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {admin && (
        <Fold label={t("activity.new")}>
          <ActionForm action={createActivity}>
            <Hidden values={{ groupId }} />
            <Field label={t("activity.name")} name="title" required maxLength={80} />
            <Field label={t("activity.startsOn")} name="startsOn" type="date" defaultValue={isoDay(new Date())} />
            <SubmitButton>{t("activity.create")}</SubmitButton>
          </ActionForm>
        </Fold>
      )}
    </GroupPage>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] text-ink/50">{label}</div>
      <div className={`mt-1 text-sm font-bold ${tone}`}>{value}</div>
    </div>
  );
}
