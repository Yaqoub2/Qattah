"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { addMethod, deleteMethod } from "@/actions/methods";
import { ActionForm, Field, Hidden, Select, SubmitButton } from "./forms";

export type MethodCardData = {
  id: string;
  kind: "bank" | "link" | "qr" | "other";
  label: string;
  iban: string | null;
  beneficiary: string | null;
  linkUrl: string | null;
  qrUrl: string | null;
  details: string | null;
};

function CopyButton({ value }: { value: string }) {
  const t = useTranslations("method");
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="text-xs text-teal"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? t("copied") : t("copy")}
    </button>
  );
}

/** One way to pay. `deletable` adds a remove button (owner or group admin). */
export function MethodCard({ method: m, groupId, deletable }: { method: MethodCardData; groupId?: string; deletable?: boolean }) {
  const t = useTranslations();
  return (
    <div className="rounded-xl border border-line bg-white/70 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{m.label}</span>
        {deletable && (
          <ActionForm action={deleteMethod} className="" confirm={t("common.confirmDelete")}>
            <Hidden values={{ id: m.id, ...(groupId ? { groupId } : {}) }} />
            <SubmitButton className="text-xs text-rose">{t("common.delete")}</SubmitButton>
          </ActionForm>
        )}
      </div>
      {m.iban && (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate font-mono text-xs" dir="ltr">
            {m.iban}
          </span>
          <CopyButton value={m.iban} />
        </div>
      )}
      {m.beneficiary && <div className="text-xs text-ink/60">{m.beneficiary}</div>}
      {m.linkUrl && (
        <a href={m.linkUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-teal underline" dir="ltr">
          {m.linkUrl}
        </a>
      )}
      {m.qrUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.qrUrl} alt={m.label} className="mt-2 size-40 rounded-lg object-contain" />
      )}
      {m.details && <p className="mt-1 whitespace-pre-line text-xs text-ink/60">{m.details}</p>}
    </div>
  );
}

/** Add a method. Shows only the fields the chosen kind uses. */
export function MethodForm({ groupId }: { groupId?: string }) {
  const t = useTranslations("method");
  const [kind, setKind] = useState<MethodCardData["kind"]>("bank");
  return (
    <ActionForm action={addMethod}>
      {groupId && <Hidden values={{ groupId }} />}
      <Select label={t("kind")} name="kind" value={kind} onChange={(e) => setKind(e.target.value as MethodCardData["kind"])}>
        <option value="bank">{t("bank")}</option>
        <option value="link">{t("link")}</option>
        <option value="qr">{t("qr")}</option>
        <option value="other">{t("other")}</option>
      </Select>
      <Field label={t("label")} name="label" required maxLength={60} placeholder={t("labelPlaceholder")} />
      {kind === "bank" && (
        <>
          <Field label="IBAN" name="iban" dir="ltr" required placeholder="SA00 0000 0000 0000 0000 0000" />
          <Field label={t("beneficiary")} name="beneficiary" maxLength={80} />
        </>
      )}
      {kind === "link" && <Field label={t("linkUrl")} name="linkUrl" type="url" dir="ltr" required placeholder="https://" />}
      {kind === "qr" && <Field label={t("qrImage")} name="qr" type="file" accept="image/png,image/jpeg,image/webp" required />}
      <Field label={kind === "other" ? t("details") : t("detailsOptional")} name="details" maxLength={300} required={kind === "other"} />
      <SubmitButton>{t("add")}</SubmitButton>
    </ActionForm>
  );
}
