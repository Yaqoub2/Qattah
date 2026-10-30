"use client";

import { Link, usePathname } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Home, Users, UserRound, Loader2, type LucideIcon } from "lucide-react";
import { useLinkStatus } from "next/link";
import { CacheRefresh } from "@/components/cache-refresh";

function NavPendingIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus();
  if (pending) return <Loader2 size={20} className="animate-spin" />;
  return <Icon size={20} />;
}

export function BottomNav() {
  const t = useTranslations("nav");
  const path = usePathname();
  const items = [
    { href: "/home", label: t("home"), icon: Home, match: "/home" },
    { href: "/home", label: t("groups"), icon: Users, match: "/groups" },
    { href: "/profile", label: t("profile"), icon: UserRound, match: "/profile" },
  ];
  return (
    <nav className="bottom-nav no-print mt-6">
      <div className="mx-auto grid max-w-lg grid-cols-3 px-2 py-2">
        {items.map((item) => {
          const active = path.startsWith(item.match);
          return (
            <Link
              key={item.match}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-1 text-xs ${
                active ? "text-teal" : "text-ink/50"
              }`}
            >
              <NavPendingIcon icon={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Brand({
  compact = false,
  showRefresh = false,
  refreshGroupId,
}: {
  compact?: boolean;
  showRefresh?: boolean;
  refreshGroupId?: string;
}) {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-2">
      <div className="mark text-lg">ق</div>
      {!compact && (
        <div>
          <div className="text-lg font-bold leading-none">{t("brand")}</div>
          <div className="text-[11px] text-ink/50">{t("tagline")}</div>
        </div>
      )}
      {showRefresh && <CacheRefresh groupId={refreshGroupId} />}
    </div>
  );
}
