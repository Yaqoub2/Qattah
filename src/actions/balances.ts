"use server";

import { requireUser } from "@/lib/session";
import { getMembership, refreshGroupBalances, refreshMemberBalance } from "@/lib/balances";
import { isAdminRole } from "@/lib/quota";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function recheckMyBalance(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const m = await getMembership(groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };
  await refreshMemberBalance(groupId, user.id);
  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}

export async function recheckGroupBalances(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const m = await getMembership(groupId, user.id);
  if (!m || !isAdminRole(m.role)) return { ok: false, error: "forbidden" };
  await refreshGroupBalances(groupId);
  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}
