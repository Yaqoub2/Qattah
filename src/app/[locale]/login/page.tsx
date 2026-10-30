import { getLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/routing";
import { LoginForm } from "@/components/login-form";
import { getSessionUser } from "@/server/session";

export default async function LoginPage() {
  const locale = await getLocale();
  if (await getSessionUser()) redirect({ href: "/home", locale });
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="mark">ق</div>
          <div>
            <div className="text-lg font-bold leading-none">{t("brand")}</div>
            <div className="text-xs text-ink/50">{t("tagline")}</div>
          </div>
        </div>
        <Link href="/login" locale={locale === "ar" ? "en" : "ar"} className="text-sm text-teal">
          {locale === "ar" ? "English" : "العربية"}
        </Link>
      </div>
      <h1 className="mb-1 text-2xl font-bold">{t("auth.title")}</h1>
      <p className="mb-6 text-sm text-ink/60">{t("auth.subtitle")}</p>
      <LoginForm telegramBot={process.env.NEXT_PUBLIC_TELEGRAM_BOT} />
    </main>
  );
}
