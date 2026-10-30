import { getLocale, getTranslations } from "next-intl/server";
import { logout } from "@/actions/auth";
import { updateProfile } from "@/actions/profile";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { MethodCard, MethodForm } from "@/components/methods";
import { Fold, Page, Section } from "@/components/page";
import { pageUser } from "@/server/guard";
import { toMethodCards } from "@/server/methods-view";
import { listMyMethods } from "@/server/queries";
import { signedUrls } from "@/server/storage";

export default async function ProfilePage() {
  const [user, t, locale] = await Promise.all([pageUser(), getTranslations(), getLocale()]);
  const methods = await listMyMethods(user.id);
  const cards = toMethodCards(methods, await signedUrls(methods.map((m) => m.qrPath)));
  const signOut = logout.bind(null, locale);

  return (
    <Page>
      <h1 className="text-2xl font-bold">{t("nav.profile")}</h1>
      <p className="mt-1 text-sm text-ink/50" dir="ltr">
        {user.email ?? user.phone}
      </p>
      <div className="card mt-5 p-4">
        <ActionForm action={updateProfile} reset={false}>
          <Field label={t("auth.name")} name="name" defaultValue={user.name} required maxLength={80} />
          <label className="block space-y-1 text-sm">
            <span className="text-ink/60">{t("profile.language")}</span>
            <select className="field" name="locale" defaultValue={user.locale}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
          <SubmitButton>{t("common.save")}</SubmitButton>
        </ActionForm>
      </div>
      <div className="mt-6 space-y-2">
        <Section title={t("method.mine")}>
          <p className="text-xs text-ink/50">{t("method.mineHint")}</p>
          {cards.map((m) => (
            <MethodCard key={m.id} method={m} deletable />
          ))}
        </Section>
        <Fold label={t("method.add")}>
          <MethodForm />
        </Fold>
      </div>
      <form action={signOut} className="mt-6">
        <button className="btn btn-ghost w-full text-rose">{t("nav.logout")}</button>
      </form>
    </Page>
  );
}
