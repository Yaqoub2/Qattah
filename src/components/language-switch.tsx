"use client";

import { Link, usePathname } from "@/i18n/routing";
import { useLocale } from "next-intl";

export function LanguageSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <div className="flex gap-2 text-sm">
      <Link
        href={pathname}
        locale="ar"
        className={`btn btn-ghost !min-h-9 px-3 ${locale === "ar" ? "text-teal" : ""}`}
      >
        العربية
      </Link>
      <Link
        href={pathname}
        locale="en"
        className={`btn btn-ghost !min-h-9 px-3 ${locale === "en" ? "text-teal" : ""}`}
      >
        English
      </Link>
    </div>
  );
}
