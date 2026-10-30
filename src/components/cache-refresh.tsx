"use client";

import { refreshWorkspace } from "@/actions/workspace";
import { useRouter } from "@/i18n/routing";
import { Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

export function CacheRefresh({ groupId }: { groupId?: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-ghost !min-h-9 shrink-0 px-2 text-xs"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await refreshWorkspace(groupId);
          router.refresh();
        })
      }
      aria-label={t("refresh")}
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
      {t("refresh")}
    </button>
  );
}
