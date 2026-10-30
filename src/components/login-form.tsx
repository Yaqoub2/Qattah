"use client";

import { identifierFromChannel, IdentifierChannel, type IdentifierMode } from "./identifier-channel";
import { requestOtp, verifyOtp } from "@/actions/auth";
import { SubmitButton } from "./forms";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useLocale, useTranslations } from "next-intl";
import { splitIdentifierPreset } from "@/lib/identity";

export function LoginForm({ preset }: { preset?: string }) {
  const t = useTranslations("auth");
  const tg = useTranslations("group");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const initial = splitIdentifierPreset(preset);
  const [mode, setMode] = useState<IdentifierMode>(initial.mode);
  const [national, setNational] = useState(initial.national);
  const [email, setEmail] = useState(initial.email);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [knownName, setKnownName] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const identifier = useMemo(() => identifierFromChannel(mode, national, email), [mode, national, email]);
  const channelLabels = {
    phone: t("phone"),
    email: t("email"),
    phoneHint: t("phoneHint"),
    phonePlaceholder: tg("phonePlaceholder"),
    phoneCanonical: (number: string) => t("phoneCanonical", { number }),
  };

  function fail(message: string) {
    setFailed(true);
    setError(message);
    setInfo(null);
  }

  async function sendCode(target: string) {
    const fd = new FormData();
    fd.set("identifier", target);
    const res = await requestOtp(fd);
    if (!res.ok) {
      fail(te.has(res.error as never) ? te(res.error as never) : res.error);
      return false;
    }
    setSentTo(res.message);
    setKnownName(res.knownName);
    setInfo(t("sentTo"));
    setError(null);
    queueMicrotask(() => codeRef.current?.focus());
    return true;
  }

  async function onSubmit(formData: FormData) {
    setError(null);
    if (!identifier) {
      fail(te("invalid_identifier"));
      return;
    }
    formData.set("identifier", identifier);
    formData.set("locale", locale);
    const code = String(formData.get("code") ?? "").trim();

    if (!/^\d{6}$/.test(code)) {
      await sendCode(identifier);
      return;
    }

    const res = await verifyOtp(formData);
    if (res.ok) {
      router.push("/home");
      router.refresh();
      return;
    }

    if (res.error === "no_challenge") {
      await sendCode(identifier);
      return;
    }

    if (res.error === "name_required") {
      setKnownName(null);
      fail(te("name_required"));
      return;
    }

    fail(te.has(res.error as never) ? te(res.error as never) : res.error);
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <IdentifierChannel
        mode={mode}
        onModeChange={(next) => {
          setMode(next);
          setSentTo(null);
          setInfo(null);
          setError(null);
        }}
        national={national}
        onNationalChange={setNational}
        email={email}
        onEmailChange={setEmail}
        labels={channelLabels}
      />

      {knownName ? (
        <p className="rounded-xl bg-teal/10 px-3 py-2 text-sm">
          {t("welcomeBack")}، <strong>{knownName}</strong>
        </p>
      ) : knownName === null ? (
        <label className="block space-y-1 text-sm">
          <span className="text-ink/70">{t("newAccountName")}</span>
          <input className="field" name="name" autoComplete="name" required />
        </label>
      ) : null}

      <label className="block space-y-1 text-sm">
        <span className="text-ink/70">{t("code")}</span>
        <input
          ref={codeRef}
          className="field"
          name="code"
          dir="ltr"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="••••••"
        />
        <p className="text-xs text-ink/50">{t("codeHint")}</p>
      </label>

      {sentTo && info && (
        <p className="text-sm text-teal">
          {info} <strong dir="ltr">{sentTo}</strong>
        </p>
      )}
      {error && <p className="text-sm text-rose">{error}</p>}

      <SubmitButton>{t("signIn")}</SubmitButton>

      {failed && (
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={async () => {
            if (!identifier) {
              fail(te("invalid_identifier"));
              return;
            }
            await sendCode(identifier);
          }}
        >
          {t("resend")}
        </button>
      )}
    </form>
  );
}
