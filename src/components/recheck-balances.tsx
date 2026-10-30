"use client";

import { recheckGroupBalances, recheckMyBalance } from "@/actions/balances";
import { useRouter } from "@/i18n/routing";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

export function RecheckBalances({ groupId, isAdmin }: { groupId: string; isAdmin: boolean }) {
  const t = useTranslations("group");
  const te = useTranslations("errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: typeof recheckMyBalance) {
    start(async () => {
      setError(null);
      const data = new FormData();
      data.set("groupId", groupId);
      const res = await action(data);
      if (!res.ok) {
        setError(te.has(res.error as never) ? te(res.error as never) : res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        className="btn btn-ghost !min-h-9 text-xs"
        disabled={pending}
        onClick={() => run(recheckMyBalance)}
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : null}
        {t("recheckMine")}
      </button>
      {isAdmin && (
        <button
          type="button"
          className="btn btn-ghost !min-h-9 text-xs"
          disabled={pending}
          onClick={() => run(recheckGroupBalances)}
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : null}
          {t("recheckAll")}
        </button>
      )}
      {error && <p className="w-full text-xs text-rose">{error}</p>}
    </div>
  );
}
