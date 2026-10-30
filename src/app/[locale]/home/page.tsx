import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { createGroup } from "@/actions/groups";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { Empty, Fold, Page, Section } from "@/components/page";
import { pageUser } from "@/server/guard";
import { listMyGroups } from "@/server/queries";

export default async function HomePage() {
  const user = await pageUser();
  const [groups, t] = await Promise.all([listMyGroups(user.id), getTranslations()]);

  return (
    <Page>
      <h1 className="text-2xl font-bold">
        {t("home.hello")} {user.name}
      </h1>
      <div className="mt-6 space-y-5">
        <Section title={t("home.groups")}>
          {groups.length === 0 ? (
            <Empty>{t("home.empty")}</Empty>
          ) : (
            <ul className="space-y-2">
              {groups.map(({ group, role }) => (
                <li key={group.id}>
                  <Link href={`/groups/${group.id}`} className="card flex items-center justify-between p-4">
                    <span className="font-semibold">{group.name}</span>
                    <span className="text-xs text-ink/50">
                      {t(`roles.${role}`)} · {group.currency}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Fold label={t("home.create")} open={groups.length === 0}>
          <ActionForm action={createGroup}>
            <Field label={t("home.groupName")} name="name" required maxLength={80} />
            <Field label={t("home.currency")} name="currency" defaultValue="SAR" maxLength={3} dir="ltr" required />
            <SubmitButton>{t("home.create")}</SubmitButton>
          </ActionForm>
        </Fold>
      </div>
    </Page>
  );
}
