import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/login-form";
import { Brand } from "@/components/shell";
import { LanguageSwitch } from "@/components/language-switch";
import { getSessionUser } from "@/lib/session";
import { redirect } from "@/i18n/routing";
import { getLocale } from "next-intl/server";

export default async function LoginPage() {
  const locale = await getLocale();
  const user = await getSessionUser();
  if (user) redirect({ href: "/home", locale });
  const t = await getTranslations("auth");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="flex items-start justify-between gap-3">
        <Brand />
        <LanguageSwitch />
      </div>
      <h1 className="mt-10 text-3xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-ink/60">{t("subtitle")}</p>
      <div className="card mt-8 p-5">
        <LoginForm />
      </div>
    </main>
  );
}
