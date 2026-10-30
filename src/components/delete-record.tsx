"use client";

import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

type Result = { ok: true; id?: string } | { ok: false; error: string };

export function DeleteRecordButton({
  action,
  hidden,
  label,
  confirmMessage,
  redirectTo,
}: {
  action: (formData: FormData) => Promise<Result>;
  hidden: Record<string, string>;
  label: string;
  confirmMessage: string;
  redirectTo?: string;
}) {
  const te = useTranslations("errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (!window.confirm(confirmMessage)) return;
    start(async () => {
      setError(null);
      const data = new FormData();
      for (const [k, v] of Object.entries(hidden)) data.set(k, v);
      const res = await action(data);
      if (!res.ok) {
        setError(te.has(res.error as never) ? te(res.error as never) : res.error);
        return;
      }
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost !min-h-9 text-xs text-rose"
        disabled={pending}
        onClick={run}
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : null}
        {label}
      </button>
      {error && <p className="mt-1 text-xs text-rose">{error}</p>}
    </div>
  );
}
