"use client";

import { loadClosedActivities } from "@/actions/workspace";
import { ActivityCardLink } from "@/components/activity-card";
import type { ActivityCardData } from "@/lib/workspace-types";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function ClosedActivitiesFold({
  groupId,
  count,
  currency,
  locale,
}: {
  groupId: string;
  count: number;
  currency: string;
  locale: string;
}) {
  const t = useTranslations("group");
  const [items, setItems] = useState<ActivityCardData[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function onToggle(open: boolean) {
    if (!open || items || loading) return;
    setLoading(true);
    try {
      setItems(await loadClosedActivities(groupId));
    } finally {
      setLoading(false);
    }
  }

  if (count <= 0) return null;

  return (
    <details
      className="rounded-[1.25rem] border border-line bg-white/60"
      onToggle={(e) => onToggle(e.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink/65 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="fold-arrow me-2 inline-block text-ink/35 transition-transform">▸</span>
        {t("closedActivities")} ({count})
      </summary>
      <div className="space-y-3 px-3 pb-3">
        {loading && (
          <div className="flex justify-center py-4 text-ink/40">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}
        {items?.map((a) => (
          <ActivityCardLink key={a.id} groupId={groupId} activity={a} currency={currency} locale={locale} />
        ))}
      </div>
    </details>
  );
}
