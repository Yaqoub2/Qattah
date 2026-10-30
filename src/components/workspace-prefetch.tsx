"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/routing";

export function HomePrefetch() {
  const router = useRouter();
  useEffect(() => {
    router.prefetch("/profile");
    router.prefetch("/groups/new");
  }, [router]);
  return null;
}
