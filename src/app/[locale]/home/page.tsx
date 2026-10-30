import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { Link } from "@/i18n/routing";
import { getTranslations, getLocale } from "next-intl/server";
import { formatMoney } from "@/lib/money";
import { Plus } from "lucide-react";
import { KafuMark } from "@/components/kafu-mark";
import { HomePrefetch } from "@/components/workspace-prefetch";
import { getUserMemberships } from "@/lib/workspace";

export default async function HomePage() {
  const user = await requirePageUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const memberships = await getUserMemberships(user.id);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <header className="flex items-center justify-between">
        <Brand showRefresh />
        <Link href="/groups/new" className="btn btn-primary !min-h-10 px-3 text-sm">
          <Plus size={16} /> {t("home.create")}
        </Link>
      </header>
      <p className="mt-8 text-ink/60">
        {t("home.hello")}، <strong>{user.name}</strong>
      </p>
      <h2 className="mt-4 text-xl font-bold">{t("home.yourGroups")}</h2>
      <div className="mt-4 flex-1 space-y-3">
        {memberships.length === 0 && (
          <div className="card p-6 text-ink/60">{t("home.empty")}</div>
        )}
        {memberships.map((m) => (
          <Link key={m.groupId} href={`/groups/${m.groupId}`} className="card block p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{m.group.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink/50">
                  <span>
                    {m.role === "owner"
                      ? t("group.owner")
                      : m.role === "admin"
                        ? t("group.admin")
                        : t("group.member")}
                  </span>
                  {(m.role === "owner" || m.role === "admin") && <KafuMark active={m.isPayingUser} />}
                </div>
              </div>
              <div className={`text-sm font-semibold ${m.netAmount >= 0 ? "text-teal" : "text-rose"}`}>
                {formatMoney(m.netAmount, m.group.currency, locale)}
              </div>
            </div>
          </Link>
        ))}
      </div>
      <BottomNav />
      <HomePrefetch />
    </div>
  );
}
