"use client";

import { createActivity, updateActivity } from "@/actions/activities";
import { Field, SubmitButton } from "./forms";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function ActivityForm({
  groupId,
  activityId,
  initial,
}: {
  groupId: string;
  activityId?: string;
  initial?: {
    title: string;
    description: string;
    startsAt: string;
    endsAt: string;
  };
}) {
  const t = useTranslations("activity");
  const te = useTranslations("errors");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    formData.set("groupId", groupId);
    if (activityId) formData.set("activityId", activityId);
    const res = activityId ? await updateActivity(formData) : await createActivity(formData);
    if (!res.ok) {
      setError(te.has(res.error as never) ? te(res.error as never) : res.error);
      return;
    }
    router.push(`/groups/${groupId}/activities/${res.id ?? activityId}`);
    router.refresh();
  }

  return (
    <form action={action} className="card mt-4 space-y-3 p-4">
      <Field name="title" label={t("title")} required defaultValue={initial?.title} />
      <label className="block space-y-1 text-sm">
        <span>{t("description")}</span>
        <textarea name="description" className="field min-h-24" defaultValue={initial?.description} />
      </label>
      <Field name="startsAt" label={t("startsAt")} type="datetime-local" defaultValue={initial?.startsAt} />
      <Field name="endsAt" label={t("endsAt")} type="datetime-local" defaultValue={initial?.endsAt} />
      {error && <p className="text-sm text-rose">{error}</p>}
      <SubmitButton>{t("save")}</SubmitButton>
    </form>
  );
}
