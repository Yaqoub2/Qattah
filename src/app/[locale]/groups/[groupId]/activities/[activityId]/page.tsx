import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/routing";
import {
  addExpense,
  closeActivity,
  deleteActivity,
  deleteExpense,
  removeActivityMember,
  reopenActivity,
  sealExpense,
  setActivityMember,
  updateExpense,
} from "@/actions/activities";
import { ActionForm, Field, Hidden, SplitFields, SubmitButton } from "@/components/forms";
import { Empty, Fold, GroupPage, Section } from "@/components/page";
import { PaymentRow } from "@/components/payment-row";
import { ReceiptInput, ReceiptLink } from "@/components/receipt";
import { formatDay, ruleInput, ruleText } from "@/lib/format";
import { activityPaid, activityParticipants, activitySummary, splitActivity } from "@/lib/ledger";
import { formatMoney, fromMinor } from "@/lib/money";
import { pageGroup } from "@/server/guard";
import { ledgerMembers, listEntries, loadActivity } from "@/server/queries";
import { signedUrls, storageEnabled } from "@/server/storage";

export default async function ActivityPage({ params }: { params: Promise<{ groupId: string; activityId: string }> }) {
  const { groupId, activityId } = await params;
  const [{ user, group, admin }, activity, entries, t, locale] = await Promise.all([
    pageGroup(groupId),
    loadActivity(groupId, activityId),
    listEntries(groupId, activityId),
    getTranslations(),
    getLocale(),
  ]);
  if (!activity) notFound();
  const receipts = await signedUrls([...activity.expenses, ...activity.payments].map((r) => r.receiptPath));
  const receiptOf = (path: string | null) => (path ? receipts.get(path) : undefined);

  const total = activity.expenses.reduce((s, e) => s + (e.approvedAt ? e.amount : 0), 0);
  const participants = activityParticipants({ ...activity, total }, ledgerMembers(group), entries);
  const open = !activity.closed;
  const split = splitActivity(total, participants);
  const listed = new Map(entries.map((e) => [e.userId, e]));
  const inActivity = new Set(participants.map((p) => p.userId));
  const covered = activityPaid(activity.payments.filter((p) => p.approvedAt));
  const report = activitySummary(split, covered);
  const exportUrl = (kind: string) => `/api/groups/${groupId}/export?kind=${kind}&activityId=${activityId}&locale=${locale}`;
  const money = (v: number) => formatMoney(v, group.currency, locale);
  const ruleT = (key: "sharesN" | "percentN", v: { n: string }) => t(`split.${key}`, v);
  const ids = { groupId, activityId };
  const names = new Map(group.members.map((m) => [m.userId, m.name]));

  return (
    <GroupPage group={group}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold">{activity.title}</h1>
          <p className="text-xs text-ink/50">
            {formatDay(activity.startsOn, locale)}
            {!open && <span className="ms-2 rounded-full bg-ink/10 px-2 py-0.5 text-ink/70">{t("activity.closed")}</span>}
          </p>
        </div>
        <div className="text-end">
          <div className="text-lg font-bold">{money(total)}</div>
          <div className="text-xs text-ink/50">
            {t("activity.collected", { paid: money(covered.intoGroup), total: money(total) })}
          </div>
        </div>
      </div>

      {!open && <p className="rounded-xl bg-ink/5 px-3 py-2 text-sm text-ink/60">{t("activity.closedHint")}</p>}

      {split.unset.length > 0 && (
        <p className="rounded-xl bg-amber/10 px-3 py-2 text-sm text-amber">
          {t("activity.unset", { names: split.unset.map((id) => names.get(id)).join("، ") })}
        </p>
      )}
      {split.unassigned !== 0 && (
        <p className="rounded-xl bg-amber/10 px-3 py-2 text-sm text-amber">
          {split.unassigned > 0
            ? t("activity.unassigned", { amount: money(split.unassigned) })
            : t("activity.overAssigned", { amount: money(-split.unassigned) })}
        </p>
      )}

      <Section title={t("expense.title")}>
        {activity.expenses.length === 0 ? (
          <Empty>{t("expense.empty")}</Empty>
        ) : (
          <ul className="card divide-y divide-line">
            {activity.expenses.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 truncate">
                  {e.title}
                  {!e.approvedAt && <span className="text-xs text-amber"> · {t("approval.pending")}</span>}
                  {e.sealed && <span className="text-xs text-ink/50"> · {t("expense.sealed")}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {receiptOf(e.receiptPath) && <ReceiptLink url={receiptOf(e.receiptPath)!} />}
                  {money(e.amount)}
                  {open && !e.sealed && (admin || (e.createdById === user.id && !e.approvedAt)) && (
                    <ActionForm action={deleteExpense} className="" confirm={t("common.confirmDelete")}>
                      <Hidden values={{ groupId, expenseId: e.id }} />
                      <SubmitButton className="text-xs text-rose">{t("common.delete")}</SubmitButton>
                    </ActionForm>
                  )}
                </span>
                {admin && open && !e.sealed && (
                  <details className="basis-full">
                    <summary className="cursor-pointer text-xs text-teal">{t("expense.edit")}</summary>
                    <ActionForm action={updateExpense} className="mt-2 space-y-2" reset={false}>
                      <Hidden values={{ groupId, expenseId: e.id }} />
                      <Field label={t("expense.name")} name="title" defaultValue={e.title} required maxLength={80} />
                      <Field
                        label={`${t("expense.amount")} (${group.currency})`}
                        name="amount"
                        defaultValue={String(fromMinor(e.amount, group.currency))}
                        inputMode="decimal"
                        dir="ltr"
                        required
                      />
                      <SubmitButton className="btn btn-primary w-full">{t("common.save")}</SubmitButton>
                    </ActionForm>
                    {e.approvedAt && (
                      <ActionForm action={sealExpense} className="mt-2" confirm={t("expense.confirmSeal")}>
                        <Hidden values={{ groupId, expenseId: e.id }} />
                        <SubmitButton className="btn btn-ghost w-full text-xs">{t("expense.seal")}</SubmitButton>
                      </ActionForm>
                    )}
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        {open && (
        <Fold label={t("expense.add")} open={activity.expenses.length === 0}>
          <ActionForm action={addExpense}>
            <Hidden values={ids} />
            <Field label={t("expense.name")} name="title" required maxLength={80} />
            <Field label={`${t("expense.amount")} (${group.currency})`} name="amount" inputMode="decimal" dir="ltr" required />
            <ReceiptInput enabled={storageEnabled()} />
            {admin && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="sealed" className="mt-1" />
                <span>
                  {t("expense.sealedLabel")}
                  <span className="block text-xs text-ink/50">{t("expense.sealedHint")}</span>
                </span>
              </label>
            )}
            {!admin && <p className="text-xs text-ink/50">{t("approval.memberHint")}</p>}
            <SubmitButton>{t("expense.add")}</SubmitButton>
          </ActionForm>
        </Fold>
        )}
      </Section>

      <Section title={t("activity.participants")}>
        <ul className="card divide-y divide-line">
          {group.members.map((m) => {
            const included = inActivity.has(m.userId);
            const entry = listed.get(m.userId);
            const rule = entry?.rule ?? m.rule;
            const source = entry ? t("activity.listed") : included ? t("activity.auto") : t("activity.notIncluded");
            return (
              <li key={m.userId} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="text-xs text-ink/50">
                      {source}
                      {included && ` · ${ruleText(rule, group.currency, locale, ruleT) ?? t("split.none")}`}
                    </div>
                  </div>
                  {(included || covered.paid[m.userId]) && (
                    <PaidVsDue
                      due={split.dues[m.userId] ?? 0}
                      paid={covered.paid[m.userId] ?? 0}
                      money={money}
                      labels={{ paid: t("ledger.paid"), left: t("activity.left"), done: t("activity.settled"), extra: t("activity.extra") }}
                    />
                  )}
                </div>
                {admin && open && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-teal">
                      {included ? t("activity.editRule") : t("activity.include")}
                    </summary>
                    <ActionForm action={setActivityMember} className="mt-2 space-y-2" reset={false}>
                      <Hidden values={{ ...ids, userId: m.userId }} />
                      <SplitFields {...ruleInput(entry?.rule ?? null, group.currency)} />
                      <p className="text-xs text-ink/50">{t("activity.ruleHint")}</p>
                      <SubmitButton className="btn btn-primary w-full">{t("common.save")}</SubmitButton>
                    </ActionForm>
                    {entry && (
                      <ActionForm action={removeActivityMember} className="mt-2" confirm={t("common.confirmDelete")}>
                        <Hidden values={{ ...ids, userId: m.userId }} />
                        <SubmitButton className="btn btn-ghost w-full text-xs">
                          {m.isPaying ? t("activity.clearOverride") : t("activity.removeListing")}
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title={t("payment.forActivity")}
        action={
          <Link href={`/groups/${groupId}/payments?activityId=${activityId}`} className="text-sm text-teal">
            {t("payment.add")}
          </Link>
        }
      >
        {activity.payments.length === 0 ? (
          <Empty>{t("payment.empty")}</Empty>
        ) : (
          <ul className="card divide-y divide-line">
            {activity.payments.map((p) => (
              <PaymentRow
                key={p.id}
                payment={p}
                names={names}
                currency={group.currency}
                locale={locale}
                groupId={groupId}
                canDelete={admin || (p.createdById === user.id && !p.approvedAt)}
                receiptUrl={receiptOf(p.receiptPath)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("report.title")}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Total label={t("report.spent")} value={money(total)} />
          <Total label={t("report.collected")} value={money(report.collected)} />
          <Total label={t("report.outstanding")} value={money(report.outstanding)} tone={report.outstanding > 0 ? "text-rose" : "text-teal"} />
        </div>
        {report.rows.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-ink/50">
                <tr>
                  <th className="px-3 py-2 text-start font-normal">{t("report.member")}</th>
                  <th className="px-3 py-2 text-end font-normal">{t("ledger.due")}</th>
                  <th className="px-3 py-2 text-end font-normal">{t("ledger.paid")}</th>
                  <th className="px-3 py-2 text-end font-normal">{t("activity.left")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.rows.map((r) => (
                  <tr key={r.userId}>
                    <td className="px-3 py-2">{names.get(r.userId)}</td>
                    <td className="px-3 py-2 text-end">{money(r.due)}</td>
                    <td className="px-3 py-2 text-end">{money(r.paid)}</td>
                    <td className={`px-3 py-2 text-end font-semibold ${r.left > 0 ? "text-rose" : "text-teal"}`}>{money(r.left)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {report.extra > 0 && <p className="text-xs text-ink/50">{t("report.extraNote", { amount: money(report.extra) })}</p>}
        <div className="grid grid-cols-2 gap-2">
          <a className="btn btn-ghost text-sm" href={exportUrl("summary")}>
            {t("report.exportSummary")}
          </a>
          <a className="btn btn-ghost text-sm" href={exportUrl("transactions")}>
            {t("report.exportTransactions")}
          </a>
        </div>
      </Section>

      {admin && (
        <div className="space-y-2">
          <ActionForm action={open ? closeActivity : reopenActivity} confirm={open ? t("activity.confirmClose") : undefined}>
            <Hidden values={ids} />
            <SubmitButton className="btn btn-ghost w-full">{open ? t("activity.close") : t("activity.reopen")}</SubmitButton>
          </ActionForm>
          {open && (
            <ActionForm action={deleteActivity} confirm={t("activity.confirmDelete")}>
              <Hidden values={ids} />
              <SubmitButton className="btn btn-ghost w-full text-rose">{t("activity.delete")}</SubmitButton>
            </ActionForm>
          )}
        </div>
      )}
    </GroupPage>
  );
}

function PaidVsDue({
  due,
  paid,
  money,
  labels,
}: {
  due: number;
  paid: number;
  money: (v: number) => string;
  labels: { paid: string; left: string; done: string; extra: string };
}) {
  const left = due - paid;
  return (
    <div className="shrink-0 text-end">
      <div className="font-semibold">{money(due)}</div>
      <div className={`text-[11px] ${left > 0 ? "text-rose" : "text-teal"}`}>
        {left > 0
          ? `${labels.paid} ${money(paid)} · ${labels.left} ${money(left)}`
          : left === 0
            ? labels.done
            : `${labels.extra} ${money(-left)}`}
      </div>
    </div>
  );
}

function Total({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] text-ink/50">{label}</div>
      <div className={`mt-1 text-sm font-bold ${tone}`}>{value}</div>
    </div>
  );
}
