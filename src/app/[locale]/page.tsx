import { getSessionUser } from "@/lib/session";
import { redirect } from "@/i18n/routing";
import { getLocale } from "next-intl/server";

export default async function LocaleIndex() {
  const locale = await getLocale();
  const user = await getSessionUser();
  redirect({ href: user ? "/home" : "/login", locale });
}
