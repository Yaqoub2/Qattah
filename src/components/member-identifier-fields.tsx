"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { IdentifierChannel, type IdentifierMode } from "./identifier-channel";

export function MemberIdentifierFields() {
  const t = useTranslations("group");
  const [mode, setMode] = useState<IdentifierMode>("phone");
  const [national, setNational] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div className="space-y-3">
      <IdentifierChannel
        mode={mode}
        onModeChange={setMode}
        national={national}
        onNationalChange={setNational}
        email={email}
        onEmailChange={setEmail}
        labels={{
          phone: t("phone"),
          email: t("email"),
          phoneHint: t("phoneHint"),
          phonePlaceholder: t("phonePlaceholder"),
          phoneCanonical: (number) => t("phoneCanonical", { number }),
        }}
      />
      <label className="block space-y-1 text-sm">
        <span className="text-ink/70">{t("memberName")}</span>
        <input className="field" name="name" autoComplete="name" />
      </label>
    </div>
  );
}
