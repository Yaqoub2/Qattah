"use client";

import { sendReminder } from "@/actions/reminders";
import { DAILY_CAP, HOURLY_CAP } from "@/lib/quota-caps";
import { SubmitButton } from "./forms";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function RemindForm({
  groupId,
  targetType,
  targetId,
  defaultBody = "",
  collect = false,
}: {
  groupId: string;
  targetType: string;
  targetId?: string;
  defaultBody?: string;
  collect?: boolean;
}) {
  const t = useTranslations("remind");
  const te = useTranslations("errors");
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  async function action(formData: FormData) {
    setError(null);
    const res = await sendReminder(formData);
    if (!res.ok) {
      setError(te.has(res.error as never) ? te(res.error as never) : res.error);
      if (res.error === "quota_exceeded") setBlocked(true);
      return;
    }
  }

  return (
    <form action={action} className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{collect ? t("collect") : t("title")}</h3>
        <span className="text-[11px] text-ink/50">
          {t("quota", { day: DAILY_CAP, hour: HOURLY_CAP })}
        </span>
      </div>
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="targetType" value={targetType} />
      {targetId && <input type="hidden" name="targetId" value={targetId} />}
      <fieldset className="space-y-2">
        <legend className="text-sm text-ink/70">{t("channel")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="channels" value="whatsapp" defaultChecked />
          {t("whatsapp")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="channels" value="email" />
          {t("email")}
        </label>
      </fieldset>
      <textarea
        name="body"
        className="field min-h-28"
        defaultValue={defaultBody}
        required
        disabled={blocked}
      />
      {error && <p className="text-sm text-rose">{error}</p>}
      {blocked ? (
        <p className="text-sm text-rose">{t("blocked")}</p>
      ) : (
        <SubmitButton>{t("send")}</SubmitButton>
      )}
    </form>
  );
}
