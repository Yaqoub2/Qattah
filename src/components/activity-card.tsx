"use client";

import { Link } from "@/i18n/routing";
import { formatMoney } from "@/lib/money";
import type { ActivityCardData } from "@/lib/workspace-types";
import { useTranslations } from "next-intl";

export function ActivityCardLink({
  groupId,
  activity,
  currency,
  locale,
}: {
  groupId: string;
  activity: ActivityCardData;
  currency: string;
  locale: string;
}) {
  const t = useTranslations("group");
  const { total, collected } = activity;
  return (
    <Link href={`/groups/${groupId}/activities/${activity.id}`} className="card block p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{activity.title}</div>
        <span className="text-xs text-ink/50">
          {activity.status === "open" ? t("open") : t("closed")}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full bg-teal"
          style={{ width: `${total ? Math.min(100, (collected / total) * 100) : 0}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-ink/50">
        {formatMoney(collected, currency, locale)} / {formatMoney(total, currency, locale)}
      </div>
    </Link>
  );
}
