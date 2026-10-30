import { getLocale, getTranslations } from "next-intl/server";
import { addPayment } from "@/actions/payments";
import { ActionForm, Field, Hidden, Select, SubmitButton } from "@/components/forms";
import { MethodCard, MethodForm } from "@/components/methods";
import { Empty, Fold, GroupPage, Section } from "@/components/page";
import { PaymentRow } from "@/components/payment-row";
import { ReceiptInput } from "@/components/receipt";
import { isoDay } from "@/lib/format";
import { pageGroup } from "@/server/guard";
import { toMethodCards } from "@/server/methods-view";
import { activityOptions, listGroupMethods, listPayments } from "@/server/queries";
import { signedUrls, storageEnabled } from "@/server/storage";

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ activityId?: string }>;
}) {
  const [{ groupId }, { activityId }] = await Promise.all([params, searchParams]);
  const [{ user, group, admin }, payments, activities, methods, t, locale] = await Promise.all([
    pageGroup(groupId),
    listPayments(groupId, 100),
    activityOptions(groupId),
    listGroupMethods(groupId),
    getTranslations(),
    getLocale(),
  ]);
  const urls = await signedUrls([...payments.map((p) => p.receiptPath), ...methods.map((m) => m.qrPath)]);
  const names = new Map(group.members.map((m) => [m.userId, m.name]));
  const groupMethods = toMethodCards(methods.filter((m) => !m.userId), urls);
  const memberMethods = group.members
    .map((m) => ({ name: m.name, cards: toMethodCards(methods.filter((x) => x.userId === m.userId), urls) }))
    .filter((m) => m.cards.length > 0);

  return (
    <GroupPage group={group}>
      <Section title={t("method.howToPay")}>
        {groupMethods.length === 0 && memberMethods.length === 0 && <Empty>{t("method.none")}</Empty>}
        {groupMethods.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-ink/50">{t("method.groupAccounts")}</div>
            {groupMethods.map((m) => (
              <MethodCard key={m.id} method={m} groupId={groupId} deletable={admin} />
            ))}
          </div>
        )}
        {memberMethods.length > 0 && (
          <details className="card p-4">
            <summary className="cursor-pointer text-sm font-semibold">{t("method.memberAccounts")}</summary>
            <div className="mt-3 space-y-3">
              {memberMethods.map((m) => (
                <div key={m.name} className="space-y-2">
                  <div className="text-xs text-ink/50">{m.name}</div>
                  {m.cards.map((c) => (
                    <MethodCard key={c.id} method={c} />
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}
        {admin && (
          <Fold label={t("method.addGroup")}>
            <MethodForm groupId={groupId} />
          </Fold>
        )}
      </Section>

      <Fold label={t("payment.add")} open={Boolean(activityId)}>
        <ActionForm action={addPayment}>
          <Hidden values={{ groupId }} />
          {admin ? (
            <Select label={t("payment.payer")} name="payerId" defaultValue={user.id}>
              {group.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </Select>
          ) : (
            <Hidden values={{ payerId: user.id }} />
          )}
          <Select label={t("payment.payee")} name="payeeId" defaultValue="">
            <option value="">{t("payment.toGroup")}</option>
            {group.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-ink/50">{t("payment.payeeHint")}</p>
          <Field label={`${t("expense.amount")} (${group.currency})`} name="amount" inputMode="decimal" dir="ltr" required />
          <Select label={t("payment.activity")} name="activityId" defaultValue={activityId ?? ""}>
            <option value="">{t("payment.noActivity")}</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </Select>
          <Field label={t("payment.paidOn")} name="paidOn" type="date" defaultValue={isoDay(new Date())} />
          <Field label={t("payment.note")} name="note" maxLength={200} />
          <ReceiptInput enabled={storageEnabled()} />
          {!admin && <p className="text-xs text-ink/50">{t("approval.memberHint")}</p>}
          <SubmitButton>{t("payment.add")}</SubmitButton>
        </ActionForm>
      </Fold>

      <Section title={t("nav.payments")}>
        {payments.length === 0 ? (
          <Empty>{t("payment.empty")}</Empty>
        ) : (
          <ul className="card divide-y divide-line">
            {payments.map((p) => (
              <PaymentRow
                key={p.id}
                payment={p}
                names={names}
                currency={group.currency}
                locale={locale}
                groupId={groupId}
                canDelete={admin || (p.createdById === user.id && !p.approvedAt)}
                receiptUrl={p.receiptPath ? urls.get(p.receiptPath) : undefined}
              />
            ))}
          </ul>
        )}
      </Section>
    </GroupPage>
  );
}
