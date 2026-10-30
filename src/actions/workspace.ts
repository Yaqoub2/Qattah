"use server";

import { requireUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
  getClosedActivities,
  getGroupMembership,
  getPaymentContributors,
  invalidateGroupWorkspace,
  invalidateUserWorkspace,
  warmAfterLogin,
} from "@/lib/workspace";
import { isAnonymousUser } from "@/lib/anonymous";
import { contributorsForPayments } from "@/lib/contributors";

export async function refreshWorkspace(groupId?: string) {
  const user = await requireUser();
  if (groupId) {
    const membership = await getGroupMembership(groupId, user.id);
    if (!membership) return;
    invalidateGroupWorkspace(groupId, [user.id]);
    revalidatePath(`/groups/${groupId}`, "layout");
    return;
  }
  invalidateUserWorkspace(user.id);
  await warmAfterLogin(user.id);
  revalidatePath("/home");
}

export async function loadClosedActivities(groupId: string) {
  const user = await requireUser();
  const membership = await getGroupMembership(groupId, user.id);
  if (!membership) return [];
  return getClosedActivities(groupId);
}

export async function loadPaymentContributors(
  groupId: string,
  activityId?: string,
  anonymousLabel = "Anonymous",
) {
  const user = await requireUser();
  const membership = await getGroupMembership(groupId, user.id);
  if (!membership) return [];
  const payments = await getPaymentContributors(groupId, activityId);
  return contributorsForPayments(
    payments.map((p) => ({
      ...p,
      payer: {
        ...p.payer,
        name: isAnonymousUser(p.payer) ? anonymousLabel : p.payer.name,
      },
    })),
  );
}
