import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { getSessionUser } from "@/server/session";

export default async function LocaleIndex() {
  const user = await getSessionUser();
  redirect({ href: user ? "/home" : "/login", locale: await getLocale() });
}
