"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

type FormState = { error?: string; ok?: boolean };
type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/**
 * Server-action form with inline, translated errors.
 * After a successful save the fields remount, so they show the saved values from the refreshed page
 * (React resets action forms, and a <select> would otherwise snap back to its first-rendered option).
 * `reset` is kept for call sites; both modes now show the server's current values.
 */
export function ActionForm({
  action,
  children,
  className = "space-y-3",
  confirm,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  reset?: boolean;
}) {
  const [state, run] = useActionState(
    async (prev: FormState & { saved: number }, fd: FormData) => {
      const next = await action(prev, fd);
      return { ...next, saved: prev.saved + (next.ok ? 1 : 0) };
    },
    { saved: 0 },
  );
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const form = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [asking, setAsking] = useState(false);
  const [toast, setToast] = useState(false);
  useEffect(() => {
    if (!state.saved) return;
    setToast(true);
    const id = setTimeout(() => setToast(false), 2400);
    return () => clearTimeout(id);
  }, [state.saved]);
  return (
    <>
    <form
      key={state.saved}
      ref={form}
      action={run}
      className={className}
      onSubmit={(e) => {
        if (confirm && !confirmed.current) {
          e.preventDefault();
          setAsking(true);
          return;
        }
        confirmed.current = false;
        setAsking(false);
      }}
    >
      {children}
      {asking && (
        <div role="alertdialog" className="mt-2 space-y-2 rounded-xl bg-rose/10 p-3 text-start text-sm">
          <p className="font-medium text-rose">{confirm}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn bg-rose text-white"
              autoFocus
              onClick={() => {
                confirmed.current = true;
                form.current?.requestSubmit();
              }}
            >
              {tc("confirmYes")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAsking(false)}>
              {tc("cancel")}
            </button>
          </div>
        </div>
      )}
      {state.error && (
        <p className="text-sm text-rose" role="alert">
          {te.has(state.error) ? te(state.error) : te("server_error")}
        </p>
      )}
    </form>
    {toast && (
      <p role="status" className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-lg rounded-xl bg-teal px-4 py-3 text-center text-sm font-semibold text-white shadow-lg">
        {tc("saved")}
      </p>
    )}
    </>
  );
}

export function SubmitButton({ children, className = "btn btn-primary w-full" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
      {children}
    </button>
  );
}

export function Field({
  label,
  className,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`block space-y-1 text-sm ${className ?? ""}`}>
      <span className="text-ink/60">{label}</span>
      <input className="field" {...input} />
    </label>
  );
}

export function Select({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-ink/60">{label}</span>
      <select className="field" {...props}>
        {children}
      </select>
    </label>
  );
}

export function Hidden({ values }: { values: Record<string, string> }) {
  return Object.entries(values).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
}

/** Method + value pair. Empty both = "set per activity". */
export function SplitFields({
  method,
  value,
  allowEmpty = true,
}: {
  method?: string | null;
  value?: string | null;
  allowEmpty?: boolean;
}) {
  const t = useTranslations("split");
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block space-y-1 text-sm">
        <span className="text-ink/60">{t("method")}</span>
        <select className="field" name="splitMethod" defaultValue={method ?? ""}>
          {allowEmpty && <option value="">{t("none")}</option>}
          <option value="shares">{t("shares")}</option>
          <option value="percentage">{t("percentage")}</option>
          <option value="amount">{t("amount")}</option>
        </select>
      </label>
      <Field label={t("value")} name="splitValue" defaultValue={value ?? ""} inputMode="decimal" dir="ltr" />
    </div>
  );
}
