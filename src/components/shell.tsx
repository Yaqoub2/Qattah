"use client";

import { Link, usePathname } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Home, UserRound } from "lucide-react";

export function BottomNav() {
  const t = useTranslations("nav");
  const path = usePathname();
  const items = [
    { href: "/home", label: t("home"), icon: Home, active: path === "/home" || path.startsWith("/groups") },
    { href: "/profile", label: t("profile"), icon: UserRound, active: path.startsWith("/profile") },
  ];
  return (
    <nav className="bottom-nav">
      <div className="mx-auto grid max-w-lg grid-cols-2 px-2 py-2">
        {items.map(({ href, label, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 py-1 text-xs ${active ? "text-teal" : "text-ink/50"}`}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** Tabs inside a group. */
export function GroupTabs({ groupId }: { groupId: string }) {
  const t = useTranslations("nav");
  const path = usePathname();
  const base = `/groups/${groupId}`;
  const tabs = [
    { href: base, label: t("overview"), active: path === base || path.startsWith(`${base}/activities`) },
    { href: `${base}/payments`, label: t("payments"), active: path.startsWith(`${base}/payments`) },
    { href: `${base}/members`, label: t("members"), active: path.startsWith(`${base}/members`) },
    { href: `${base}/reports`, label: t("reports"), active: path.startsWith(`${base}/reports`) },
  ];
  return (
    <div className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-line/60 p-1 text-sm">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`rounded-xl py-2 text-center ${tab.active ? "bg-card font-semibold shadow-sm" : "text-ink/60"}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
