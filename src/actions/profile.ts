"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { actionUser } from "@/server/guard";
import { refreshSessionUser } from "@/server/session";
import { f, formAction } from "@/server/action";

/** Session check, one UPDATE on users by PK, new cookie, then reopen the profile in the chosen language. */
export const updateProfile = formAction(
  z.object({ name: f.text(80), locale: z.enum(["ar", "en"]) }),
  async ({ name, locale }) => {
    const user = await actionUser();
    await prisma.user.update({ where: { id: user.id }, data: { name, locale } });
    await refreshSessionUser({ name, locale });
    // next-intl keeps NEXT_LOCALE and would send /ar back to the previous language.
    (await cookies()).set("NEXT_LOCALE", locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    redirect(`/${locale}/profile`);
  },
);
