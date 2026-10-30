import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { Field, SubmitButton } from "@/components/forms";
import { addMember, removeMember, updateMember } from "@/actions/groups";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAdminRole } from "@/lib/quota";
import { ServerFormAction } from "@/lib/utils";
import { formatMoney, fromMinor } from "@/lib/money";
import { getLocale } from "next-intl/server";
import { KafuMark } from "@/components/kafu-mark";
import { MemberIdentifierFields } from "@/components/member-identifier-fields";
import { MembersTabs } from "@/components/members-tabs";
import { Link } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import {
  getGroupInvites,
  getGroupMemberPaymentMethods,
  getGroupMembers,
  getGroupMembership,
} from "@/lib/workspace";

export default async function MembersPage({ params }: { params: Promise<{ groupId: string }> }) {
  const user = await requirePageUser();
  const { groupId } = await params;
  const membership = await getGroupMembership(groupId, user.id);
  if (!membership) notFound();
  const admin = isAdminRole(membership.role);
  const t = await getTranslations("group");
  const locale = await getLocale();
  const [members, invites, methods] = await Promise.all([
    getGroupMembers(groupId),
    getGroupInvites(groupId),
    getGroupMemberPaymentMethods(groupId),
  ]);
  const app = process.env.APP_URL ?? "";
  const methodsByUser = new Map<string, string[]>();
  for (const m of methods) {
    const list = methodsByUser.get(m.userId) ?? [];
    list.push(m.label);
    methodsByUser.set(m.userId, list);
  }

  const addPanel = (
    <form action={addMember as ServerFormAction} className="card space-y-3 p-4">
      <p className="text-sm text-ink/55">{t("inviteHint")}</p>
      <input type="hidden" name="groupId" value={groupId} />
      <MemberIdentifierFields />
      <label className="block space-y-1 text-sm">
        <span>{t("role")}</span>
        <select name="role" className="field" defaultValue="member">
          <option value="member">{t("member")}</option>
          <option value="admin">{t("admin")}</option>
        </select>
      </label>
      <KafuMark withCheckbox />
      <Field name="defaultShare" label={t("share")} defaultValue="1" />
      <Field name="defaultPercentage" label={t("percentage")} />
      <Field name="defaultAmount" label={t("amount")} />
      <SubmitButton>{t("addMember")}</SubmitButton>
    </form>
  );

  const managePanel = (
    <div className="space-y-3">
      {members.map((mem) => {
        const invite = invites.find((i) => i.userId === mem.userId);
        const labels = methodsByUser.get(mem.userId) ?? [];
        return (
          <div key={mem.userId} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/groups/${groupId}/members/${mem.userId}`} className="min-w-0 flex-1">
                <div className="font-semibold">{mem.user.name}</div>
                <div className="mt-1 space-y-0.5 text-xs text-ink/60">
                  {mem.user.phone && (
                    <div dir="ltr">
                      {t("phone")}: {mem.user.phone}
                    </div>
                  )}
                  {mem.user.email && (
                    <div dir="ltr">
                      {t("email")}: {mem.user.email}
                    </div>
                  )}
                  <div>
                    {t("paymentMethods")}: {labels.length ? labels.join(" · ") : t("noPaymentMethods")}
                  </div>
                  <div>
                    {t("invitedAt")}: {formatDateTime(mem.invitedAt, locale) ?? "—"}
                  </div>
                  <div>
                    {t("firstEnteredAt")}: {formatDateTime(mem.firstEnteredAt, locale) ?? t("neverEntered")}
                  </div>
                  {admin && (
                    <>
                      <div>
                        {t("role")}: {t(mem.role)}
                      </div>
                      <div>
                        {t("status")}: {t(`userStatus.${mem.user.status}`)}
                      </div>
                      <div className="text-teal">
                        {formatMoney(mem.netAmount, membership.group.currency, locale)} · {t("due")}{" "}
                        {formatMoney(mem.dueAmount, membership.group.currency, locale)}
                      </div>
                    </>
                  )}
                </div>
              </Link>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {admin &&
                  (mem.isPayingUser ? (
                    <KafuMark active />
                  ) : (
                    <span className="text-[11px] text-ink/40">{t("notPaying")}</span>
                  ))}
                <Link href={`/groups/${groupId}/members/${mem.userId}`} className="text-xs text-teal">
                  {t("viewMember")}
                </Link>
              </div>
            </div>
            {admin && (
              <form action={updateMember as ServerFormAction} className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <input type="hidden" name="groupId" value={groupId} />
                <input type="hidden" name="userId" value={mem.userId} />
                <select name="role" className="field" defaultValue={mem.role}>
                  <option value="member">{t("member")}</option>
                  <option value="admin">{t("admin")}</option>
                  {mem.role === "owner" && <option value="owner">{t("owner")}</option>}
                </select>
                <KafuMark withCheckbox defaultChecked={mem.isPayingUser} />
                <input name="defaultShare" className="field" defaultValue={mem.defaultShare} />
                <input
                  name="defaultPercentage"
                  className="field"
                  defaultValue={mem.defaultPercentage ? String(mem.defaultPercentage) : ""}
                  placeholder="%"
                />
                <input
                  name="defaultAmount"
                  className="field col-span-2"
                  defaultValue={
                    mem.defaultAmount != null
                      ? String(fromMinor(mem.defaultAmount, membership.group.currency))
                      : ""
                  }
                  placeholder={t("amount")}
                />
                <SubmitButton className="btn btn-primary">{t("save")}</SubmitButton>
              </form>
            )}
            {admin && mem.role !== "owner" && (
              <form action={removeMember as ServerFormAction} className="mt-2">
                <input type="hidden" name="groupId" value={groupId} />
                <input type="hidden" name="userId" value={mem.userId} />
                <button className="text-sm text-rose">{t("remove")}</button>
              </form>
            )}
            {invite && (
              <p className="mt-2 break-all text-[11px] text-ink/40" dir="ltr">
                {app}/{locale}/invite/{invite.token}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact showRefresh refreshGroupId={groupId} />
      <h1 className="mt-6 text-2xl font-bold">{t("membersTitle")}</h1>
      <MembersTabs canAdd={admin} addPanel={addPanel} managePanel={managePanel} />
      <BottomNav />
    </div>
  );
}
