"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

export function KafuMark({
  active = true,
  withCheckbox = false,
  defaultChecked,
  name = "isPayingUser",
}: {
  active?: boolean;
  withCheckbox?: boolean;
  defaultChecked?: boolean;
  name?: string;
}) {
  const t = useTranslations("group");
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const inputId = useId();
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    const timer = window.setTimeout(() => document.addEventListener("click", onDoc), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", onDoc);
    };
  }, [open]);

  if (!active && !withCheckbox) return null;

  const chip = (
    <button
      type="button"
      className="kafu-chip"
      aria-describedby={tipId}
      aria-expanded={open}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      {t("kafu")}
    </button>
  );

  const tip = (
    <span id={tipId} role="tooltip" className="kafu-tip">
      {t("kafuHint")}
    </span>
  );

  if (withCheckbox) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <input
          id={inputId}
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="size-4 accent-teal"
        />
        <span ref={box} className={`kafu-wrap ${open ? "kafu-open" : ""}`}>
          {chip}
          {tip}
        </span>
      </span>
    );
  }

  return (
    <span ref={box} className={`kafu-wrap ${open ? "kafu-open" : ""}`}>
      {chip}
      {tip}
    </span>
  );
}
