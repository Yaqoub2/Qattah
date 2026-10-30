import { prisma } from "@/lib/db";
import { LoginForm } from "@/components/login-form";
import { Brand } from "@/components/shell";
import { LanguageSwitch } from "@/components/language-switch";
import { getTranslations } from "next-intl/server";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { user: true, group: true },
  });
  const t = await getTranslations("auth");
  if (!invite || invite.expiresAt < new Date()) {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <Brand />
        <p className="mt-8">رابط الدعوة غير صالح.</p>
      </main>
    );
  }
  const preset = invite.user.phone ?? invite.user.email ?? "";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="flex items-start justify-between gap-3">
        <Brand />
        <LanguageSwitch />
      </div>
      <h1 className="mt-8 text-2xl font-bold">{invite.group.name}</h1>
      <p className="mt-2 text-ink/60">{t("subtitle")}</p>
      <div className="card mt-6 p-5">
        <LoginForm preset={preset} />
      </div>
    </main>
  );
}
