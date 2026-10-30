"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { requestCode, verifyCode } from "@/actions/auth";

export function LoginForm({ telegramBot }: { telegramBot?: string }) {
  const t = useTranslations("auth");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [step, setStep] = useState<"identify" | "verify">("identify");
  const [newUser, setNewUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notLinked, setNotLinked] = useState(false);
  const [pending, start] = useTransition();
  const isPhone = /^[+0-9٠-٩\s\-()]{6,}$/.test(identifier.trim());
  const botLink = telegramBot ? `https://t.me/${telegramBot}?start=link` : null;

  const fail = (code: string) => {
    setNotLinked(code === "telegram_not_linked");
    setError(te.has(code) ? te(code) : te("server_error"));
  };

  function onSubmit(fd: FormData) {
    setError(null);
    setNotLinked(false);
    start(async () => {
      if (step === "identify") {
        const res = await requestCode(identifier);
        if (!res.ok) return fail(res.error);
        setNewUser(res.newUser);
        setStep("verify");
        return;
      }
      const res = await verifyCode({
        identifier,
        code: String(fd.get("code") ?? "").trim(),
        name: String(fd.get("name") ?? ""),
        locale,
      });
      if (!res.ok) return fail(res.error);
      router.replace("/home");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <label className="block space-y-1 text-sm">
        <span className="text-ink/60">{t("identifier")}</span>
        <input
          className="field"
          dir="ltr"
          autoComplete="username"
          placeholder="you@example.com · 05xxxxxxxx"
          value={identifier}
          readOnly={step === "verify"}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </label>

      {step === "identify" && isPhone && botLink && (
        <p className="text-xs text-ink/60">
          {t("telegramFirst")}{" "}
          <a className="text-teal underline" href={botLink} target="_blank" rel="noreferrer">
            @{telegramBot}
          </a>
        </p>
      )}

      {step === "verify" && (
        <>
          {newUser && (
            <label className="block space-y-1 text-sm">
              <span className="text-ink/60">{t("name")}</span>
              <input className="field" name="name" autoComplete="name" required />
            </label>
          )}
          <label className="block space-y-1 text-sm">
            <span className="text-ink/60">{t("code")}</span>
            <input
              className="field tracking-[0.4em]"
              name="code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              autoFocus
              required
            />
          </label>
        </>
      )}

      {error && (
        <p className="text-sm text-rose" role="alert">
          {error}
        </p>
      )}
      {notLinked && botLink && (
        <a className="btn btn-ghost w-full" href={botLink} target="_blank" rel="noreferrer">
          {t("openBot")}
        </a>
      )}

      <button className="btn btn-primary w-full" disabled={pending}>
        {step === "identify" ? t("sendCode") : t("signIn")}
      </button>
      {step === "verify" && (
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={() => {
            setStep("identify");
            setError(null);
          }}
        >
          {t("change")}
        </button>
      )}
    </form>
  );
}
