"use client";

import { nationalPhoneDigits, normalizeEmail, normalizePhone } from "@/lib/identity";
import { useMemo } from "react";

export type IdentifierMode = "phone" | "email";

export function identifierFromChannel(mode: IdentifierMode, national: string, email: string) {
  if (mode === "email") return normalizeEmail(email) ?? email.trim();
  return normalizePhone(national) ?? "";
}

export function IdentifierChannel({
  mode,
  onModeChange,
  national,
  onNationalChange,
  email,
  onEmailChange,
  labels,
}: {
  mode: IdentifierMode;
  onModeChange: (mode: IdentifierMode) => void;
  national: string;
  onNationalChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  labels: {
    phone: string;
    email: string;
    phoneHint: string;
    phonePlaceholder: string;
    phoneCanonical: (number: string) => string;
  };
}) {
  const canonical = useMemo(() => (national.trim() ? normalizePhone(national) : null), [national]);
  const identifier = identifierFromChannel(mode, national, email);

  function handleNational(value: string) {
    const trimmed = value.trim();
    if (
      trimmed.startsWith("+") ||
      trimmed.startsWith("00") ||
      trimmed.startsWith("966") ||
      trimmed.startsWith("0") ||
      /[٠-٩۰-۹]/.test(value)
    ) {
      onNationalChange(nationalPhoneDigits(value));
      return;
    }
    onNationalChange(value.replace(/[^\d]/g, ""));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label={`${labels.phone} / ${labels.email}`}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "phone"}
          className={`btn !min-h-10 text-sm ${mode === "phone" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => onModeChange("phone")}
        >
          {labels.phone}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "email"}
          className={`btn !min-h-10 text-sm ${mode === "email" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => onModeChange("email")}
        >
          {labels.email}
        </button>
      </div>
      <input type="hidden" name="identifier" value={identifier} />
      {mode === "phone" ? (
        <label className="block space-y-1 text-sm">
          <span className="text-ink/70">{labels.phone}</span>
          <div className="phone-field">
            <span className="phone-cc">+966</span>
            <input
              className="field"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder={labels.phonePlaceholder}
              value={national}
              required={mode === "phone"}
              onChange={(e) => handleNational(e.target.value)}
            />
          </div>
          <p className="text-xs leading-5 text-ink/50">{labels.phoneHint}</p>
          {canonical && (
            <p className="text-xs text-teal" dir="ltr">
              {labels.phoneCanonical(canonical)}
            </p>
          )}
        </label>
      ) : (
        <label className="block space-y-1 text-sm">
          <span className="text-ink/70">{labels.email}</span>
          <input
            className="field"
            dir="ltr"
            type="email"
            autoComplete="email"
            required={mode === "email"}
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}
