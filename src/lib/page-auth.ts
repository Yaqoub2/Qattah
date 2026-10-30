import { getSessionUser } from "@/lib/session";
import { redirect } from "@/i18n/routing";
import { getLocale } from "next-intl/server";

export async function requirePageUser() {
  const locale = await getLocale();
  const user = await getSessionUser();
  if (!user) redirect({ href: "/login", locale });
  return user!;
}
