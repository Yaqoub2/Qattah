import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { Field, SubmitButton } from "@/components/forms";
import { LanguageSwitch } from "@/components/language-switch";
import { updateProfile } from "@/actions/methods";
import { logout } from "@/actions/auth";
import { getTranslations } from "next-intl/server";
import { ServerFormAction } from "@/lib/utils";
import { PaymentMethodManager } from "@/components/payment-method-manager";
import { getUserPaymentMethods } from "@/lib/workspace";

export default async function ProfilePage() {
  const user = await requirePageUser();
  const t = await getTranslations();
  const methods = await getUserPaymentMethods(user.id);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <header className="flex items-start justify-between gap-3">
        <Brand />
        <LanguageSwitch />
      </header>
      <h1 className="mt-8 text-2xl font-bold">{t("nav.profile")}</h1>
      <form action={updateProfile as ServerFormAction} className="card mt-4 space-y-4 p-4">
        <Field name="name" label={t("auth.name")} defaultValue={user.name} required />
        <label className="block space-y-1 text-sm">
          <span className="text-ink/70">{t("common.language")}</span>
          <select name="locale" className="field" defaultValue={user.locale}>
            <option value="ar">{t("common.langAr")}</option>
            <option value="en">{t("common.langEn")}</option>
          </select>
        </label>
        {(user.phone || user.email) && (
          <p className="text-xs text-ink/45" dir="ltr">
            {[user.phone, user.email].filter(Boolean).join(" · ")}
          </p>
        )}
        <SubmitButton>{t("group.save")}</SubmitButton>
      </form>

      <h2 className="mt-8 text-lg font-bold">{t("payment.methods")}</h2>
      <p className="mt-1 text-sm text-ink/55">{t("payment.methodsIntro")}</p>
      <div className="mt-3">
        <PaymentMethodManager methods={methods} />
      </div>
      <form action={logout as ServerFormAction} className="mt-8">
        <button className="btn btn-ghost w-full">{t("nav.logout")}</button>
      </form>
      <BottomNav />
    </div>
  );
}
