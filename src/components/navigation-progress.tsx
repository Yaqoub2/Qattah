"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(false);
  }, [pathname]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setActive(false), 8000);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      try {
        const next = new URL(a.href, window.location.href);
        if (next.origin !== window.location.origin) return;
        if (next.pathname === window.location.pathname && next.search === window.location.search) {
          return;
        }
        setActive(true);
      } catch {
        /* ignore invalid href */
      }
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return <div className={`nav-progress no-print ${active ? "nav-progress-on" : ""}`} aria-hidden={!active} />;
}
