"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { getMembership, refreshGroupBalances } from "@/lib/balances";
import { isAdminRole } from "@/lib/quota";
import { revalidatePath } from "next/cache";
import { invalidateGroupWorkspace } from "@/lib/workspace";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export async function createActivity(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const m = await getMembership(groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };
  if (!isAdminRole(m.role) && !m.group.membersCanSubmit) return { ok: false, error: "forbidden" };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "title_required" };
  const description = String(formData.get("description") ?? "").trim() || null;
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");

  const activity = await prisma.activity.create({
    data: {
      groupId,
      title,
      description,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      createdById: user.id,
    },
  });
  await audit({
    groupId,
    actorUserId: user.id,
    action: "activity.create",
    entityType: "activity",
    entityId: activity.id,
    metadata: { title },
  });
  revalidatePath(`/groups/${groupId}`);
  invalidateGroupWorkspace(groupId, [user.id]);
  return { ok: true, id: activity.id };
}

export async function closeActivity(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const activityId = String(formData.get("activityId") ?? "");
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) return { ok: false, error: "not_found" };
  const m = await getMembership(activity.groupId, user.id);
  if (!m || !isAdminRole(m.role)) return { ok: false, error: "forbidden" };

  await prisma.activity.update({
    where: { id: activityId },
    data: { status: "closed" },
  });
  await audit({
    groupId: activity.groupId,
    actorUserId: user.id,
    action: "activity.close",
    entityType: "activity",
    entityId: activityId,
  });
  revalidatePath(`/groups/${activity.groupId}`);
  invalidateGroupWorkspace(activity.groupId, [user.id]);
  return { ok: true, id: activityId };
}

export async function reopenActivity(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const activityId = String(formData.get("activityId") ?? "");
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) return { ok: false, error: "not_found" };
  const m = await getMembership(activity.groupId, user.id);
  if (!m || !isAdminRole(m.role)) return { ok: false, error: "forbidden" };
  await prisma.activity.update({ where: { id: activityId }, data: { status: "open" } });
  await audit({
    groupId: activity.groupId,
    actorUserId: user.id,
    action: "activity.reopen",
    entityType: "activity",
    entityId: activityId,
  });
  revalidatePath(`/groups/${activity.groupId}`);
  invalidateGroupWorkspace(activity.groupId, [user.id]);
  return { ok: true, id: activityId };
}

export async function updateActivity(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const activityId = String(formData.get("activityId") ?? "");
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) return { ok: false, error: "not_found" };
  const m = await getMembership(activity.groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };
  if (!isAdminRole(m.role) && activity.createdById !== user.id) return { ok: false, error: "forbidden" };
  if (activity.status === "closed") return { ok: false, error: "activity_closed" };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "title_required" };
  const description = String(formData.get("description") ?? "").trim() || null;
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");

  await prisma.activity.update({
    where: { id: activityId },
    data: {
      title,
      description,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
    },
  });
  await audit({
    groupId: activity.groupId,
    actorUserId: user.id,
    action: "activity.update",
    entityType: "activity",
    entityId: activityId,
    metadata: { title },
  });
  revalidatePath(`/groups/${activity.groupId}`);
  invalidateGroupWorkspace(activity.groupId, [user.id]);
  return { ok: true, id: activityId };
}

export async function deleteActivity(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const activityId = String(formData.get("activityId") ?? "");
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) return { ok: false, error: "not_found" };
  const m = await getMembership(activity.groupId, user.id);
  if (!m || !isAdminRole(m.role)) return { ok: false, error: "forbidden" };

  const sealedCount = await prisma.expense.count({
    where: { activityId, isSealed: true },
  });
  if (sealedCount > 0) return { ok: false, error: "has_sealed_expense" };

  await prisma.activity.delete({ where: { id: activityId } });
  await audit({
    groupId: activity.groupId,
    actorUserId: user.id,
    action: "activity.delete",
    entityType: "activity",
    entityId: activityId,
  });
  await refreshGroupBalances(activity.groupId);
  revalidatePath(`/groups/${activity.groupId}`);
  invalidateGroupWorkspace(activity.groupId, [user.id]);
  return { ok: true, id: activityId };
}
