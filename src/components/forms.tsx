"use client";

import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

export function SubmitButton({
  children,
  className = "btn btn-primary w-full",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const t = useTranslations("common");
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? t("loading") : children}
    </button>
  );
}

export function Field({
  name,
  label,
  type = "text",
  defaultValue,
  required,
  inputMode,
  autoComplete,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-ink/70">{label}</span>
      <input
        className="field"
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        inputMode={inputMode}
        autoComplete={autoComplete}
      />
    </label>
  );
}
