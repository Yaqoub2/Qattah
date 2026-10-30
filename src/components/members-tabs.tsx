"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

export function MembersTabs({
  canAdd,
  addPanel,
  managePanel,
}: {
  canAdd: boolean;
  addPanel: ReactNode;
  managePanel: ReactNode;
}) {
  const t = useTranslations("group");
  const [tab, setTab] = useState<"add" | "manage">("manage");

  return (
    <div className="mt-4">
      {canAdd && (
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-white/70 p-1">
          <button
            type="button"
            className={`rounded-xl py-2 text-sm font-semibold ${
              tab === "add" ? "bg-teal text-white" : "text-ink/60"
            }`}
            onClick={() => setTab("add")}
          >
            {t("addMember")}
          </button>
          <button
            type="button"
            className={`rounded-xl py-2 text-sm font-semibold ${
              tab === "manage" ? "bg-teal text-white" : "text-ink/60"
            }`}
            onClick={() => setTab("manage")}
          >
            {t("manageMembers")}
          </button>
        </div>
      )}
      {canAdd && tab === "add" ? addPanel : managePanel}
    </div>
  );
}
