"use server";

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
    redirect(`/${locale}/profile`);
  },
);
