"use client";

import { usePathname } from "@/i18n/routing";
import { useEffect, useState } from "react";

/** Starts on any in-app link click and stops when the new page is shown. */
export function NavProgress() {
  const path = usePathname();
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(false);
  }, [path]);

  useEffect(() => {
    const start = (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest("a");
      if (!a || a.target === "_blank") return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const url = new URL(a.href, location.origin);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setOn(true);
    };
    document.addEventListener("click", start);
    return () => document.removeEventListener("click", start);
  }, []);

  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => setOn(false), 8000);
    return () => clearTimeout(id);
  }, [on]);

  if (!on) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-line">
      <div className="h-full w-1/3 animate-[load_0.9s_ease-in-out_infinite] bg-teal" />
    </div>
  );
}
