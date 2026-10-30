import { getLocale, getTranslations } from "next-intl/server";
import { addMember, removeMember, updateMember } from "@/actions/groups";
import { ActionForm, Field, Hidden, Select, SplitFields, SubmitButton } from "@/components/forms";
import { Fold, GroupPage, Section } from "@/components/page";
import { formatDay, isoDay, ruleInput, ruleText } from "@/lib/format";
import { pageGroup } from "@/server/guard";
import type { GroupMemberView } from "@/server/queries";

export default async function MembersPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { group, admin } = await pageGroup(groupId);
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const ruleT = (key: "sharesN" | "percentN", v: { n: string }) => t(`split.${key}`, v);

  return (
    <GroupPage group={group}>
      <p className="text-xs text-ink/60">{t("member.rulesHint")}</p>
      <Section title={t("nav.members")}>
        <ul className="card divide-y divide-line">
          {group.members.map((m) => (
            <li key={m.userId} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="truncate text-xs text-ink/50" dir="auto">
                    {m.contact}
                  </div>
                </div>
                <div className="shrink-0 text-end text-xs">
                  <div className={m.isPaying ? "text-teal" : "text-ink/50"}>
                    {m.isPaying ? t("member.paying") : t("member.other")}
                    {m.role !== "member" && ` · ${t(`roles.${m.role}`)}`}
                  </div>
                  <div className="text-ink/50">
                    {ruleText(m.rule, group.currency, locale, ruleT) ?? t("split.none")}
                    {m.isPaying && ` · ${t("member.from")} ${formatDay(m.startsOn, locale)}`}
                  </div>
                </div>
              </div>
              {admin && <MemberEditor groupId={groupId} member={m} currency={group.currency} t={t} />}
            </li>
          ))}
        </ul>
      </Section>

      {admin && (
        <Fold label={t("member.add")}>
          <ActionForm action={addMember}>
            <Hidden values={{ groupId }} />
            <Field label={t("auth.name")} name="name" required maxLength={80} />
            <Field label={t("auth.identifier")} name="identifier" dir="ltr" placeholder="you@example.com · 05xxxxxxxx" required />
            <MemberFields t={t} />
            <SubmitButton>{t("member.add")}</SubmitButton>
          </ActionForm>
        </Fold>
      )}
    </GroupPage>
  );
}

type T = Awaited<ReturnType<typeof getTranslations>>;

function MemberFields({ t, member, currency }: { t: T; member?: GroupMemberView; currency?: string }) {
  const rule = member && currency ? ruleInput(member.rule, currency) : { method: "shares", value: "1" };
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPaying" defaultChecked={member?.isPaying ?? true} className="size-4 accent-teal" />
        {t("member.payingLabel")}
      </label>
      <Field
        label={t("member.startsOn")}
        name="startsOn"
        type="date"
        defaultValue={isoDay(member?.startsOn ?? new Date())}
      />
      <SplitFields method={rule.method} value={rule.value} />
    </>
  );
}

function MemberEditor({ groupId, member, currency, t }: { groupId: string; member: GroupMemberView; currency: string; t: T }) {
  const ids = { groupId, userId: member.userId };
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-teal">{t("common.edit")}</summary>
      <ActionForm action={updateMember} className="mt-2 space-y-2" reset={false}>
        <Hidden values={ids} />
        <MemberFields t={t} member={member} currency={currency} />
        {member.role !== "owner" && (
          <Select label={t("member.role")} name="role" defaultValue={member.role}>
            <option value="member">{t("roles.member")}</option>
            <option value="admin">{t("roles.admin")}</option>
          </Select>
        )}
        <SubmitButton>{t("common.save")}</SubmitButton>
      </ActionForm>
      {member.role !== "owner" && (
        <ActionForm action={removeMember} className="mt-2" confirm={t("member.confirmRemove")}>
          <Hidden values={ids} />
          <SubmitButton className="btn btn-ghost w-full text-xs text-rose">{t("member.remove")}</SubmitButton>
        </ActionForm>
      )}
    </details>
  );
}
