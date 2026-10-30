"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { detectIdentifier } from "@/lib/identity";
import { isAnonymousPhone } from "@/lib/anonymous";
import { isAdminRole } from "@/lib/quota";
import { getMembership, refreshGroupBalances } from "@/lib/balances";
import { parseMajorInput } from "@/lib/money";
import type { GroupRole, SplitMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { invalidateGroupWorkspace, invalidateUserWorkspace } from "@/lib/workspace";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

async function adminOf(groupId: string, userId: string) {
  const m = await getMembership(groupId, userId);
  if (!m) return null;
  if (!isAdminRole(m.role)) return null;
  return m;
}

export async function createGroup(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const currency = String(formData.get("currency") ?? "SAR").toUpperCase();
  const defaultSplitMethod = (String(formData.get("defaultSplitMethod") ?? "equal") as SplitMethod) || "equal";
  if (!name) return { ok: false, error: "name_required" };

  const membersCanSubmit = String(formData.get("membersCanSubmit") ?? "") === "on";

  const group = await prisma.group.create({
    data: {
      name,
      currency,
      defaultSplitMethod,
      membersCanSubmit,
      createdById: user.id,
      members: {
        create: {
          userId: user.id,
          role: "owner",
          isPayingUser: true,
          invitedAt: new Date(),
          firstEnteredAt: new Date(),
        },
      },
    },
  });
  await audit({
    groupId: group.id,
    actorUserId: user.id,
    action: "group.create",
    entityType: "group",
    entityId: group.id,
    metadata: { name },
  });
  revalidatePath("/");
  invalidateUserWorkspace(user.id);
  return { ok: true, id: group.id };
}

export async function updateGroupSettings(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const m = await adminOf(groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };

  const name = String(formData.get("name") ?? "").trim();
  const currency = String(formData.get("currency") ?? m.group.currency).toUpperCase();
  const defaultSplitMethod = String(formData.get("defaultSplitMethod") ?? m.group.defaultSplitMethod) as SplitMethod;
  const membersCanSubmit = String(formData.get("membersCanSubmit") ?? "") === "on";

  await prisma.group.update({
    where: { id: groupId },
    data: { name, currency, defaultSplitMethod, membersCanSubmit },
  });
  await audit({
    groupId,
    actorUserId: user.id,
    action: "group.update",
    entityType: "group",
    entityId: groupId,
  });
  revalidatePath(`/groups/${groupId}`);
  invalidateGroupWorkspace(groupId, [user.id]);
  return { ok: true, id: groupId };
}

export async function depositGroupBudget(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const m = await adminOf(groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };

  const amount = parseMajorInput(String(formData.get("amount") ?? ""), m.group.currency);
  if (amount === null || amount <= 0) return { ok: false, error: "invalid_amount" };
  const payerUserId = String(formData.get("payerUserId") ?? user.id);
  const inGroup = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: payerUserId } },
  });
  if (!inGroup) return { ok: false, error: "not_member" };
  const notes = String(formData.get("note") ?? "").trim() || null;

  await prisma.payment.create({
    data: {
      groupId,
      payerUserId,
      amount,
      notes,
      approvalStatus: "pending",
    },
  });

  await audit({
    groupId,
    actorUserId: user.id,
    action: "group.budget.deposit",
    entityType: "group",
    entityId: groupId,
    metadata: { amount, payerUserId },
  });
  await refreshGroupBalances(groupId);
  revalidatePath(`/groups/${groupId}`);
  invalidateGroupWorkspace(groupId, [user.id, payerUserId]);
  return { ok: true, id: groupId };
}

export async function addMember(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const m = await adminOf(groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };

  const raw = String(formData.get("identifier") ?? "");
  const displayName = String(formData.get("name") ?? "").trim() || raw;
  const detected = detectIdentifier(raw);
  if (!detected) return { ok: false, error: "invalid_identifier" };
  if (detected.phone && isAnonymousPhone(detected.phone)) return { ok: false, error: "anonymous_not_allowed" };

  let target = detected.email
    ? await prisma.user.findUnique({ where: { email: detected.email } })
    : await prisma.user.findUnique({ where: { phone: detected.phone } });

  if (!target) {
    target = await prisma.user.create({
      data: {
        name: displayName,
        status: "invited",
        email: detected.email,
        phone: detected.phone,
      },
    });
  }

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: target.id } },
  });
  if (existing) return { ok: false, error: "already_member" };

  const role = (String(formData.get("role") ?? "member") as GroupRole) || "member";
  const isPayingUser = String(formData.get("isPayingUser") ?? "") === "on";
  const defaultShare = Number(formData.get("defaultShare") ?? 1) || 1;
  const pctRaw = String(formData.get("defaultPercentage") ?? "").trim();
  const amtRaw = String(formData.get("defaultAmount") ?? "").trim();

  await prisma.groupMember.create({
    data: {
      groupId,
      userId: target.id,
      role: role === "owner" ? "admin" : role,
      isPayingUser,
      defaultShare,
      defaultPercentage: pctRaw ? pctRaw : null,
      defaultAmount: amtRaw ? parseMajorInput(amtRaw, m.group.currency) : null,
      invitedAt: new Date(),
    },
  });

  const token = crypto.randomUUID();
  await prisma.inviteToken.create({
    data: {
      token,
      userId: target.id,
      groupId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
    },
  });

  await audit({
    groupId,
    actorUserId: user.id,
    action: "member.add",
    entityType: "member",
    entityId: target.id,
    metadata: { identifier: raw, role },
  });
  await refreshGroupBalances(groupId);
  revalidatePath(`/groups/${groupId}/members`);
  invalidateGroupWorkspace(groupId, [user.id, target.id]);
  return { ok: true, id: target.id };
}

export async function updateMember(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const m = await adminOf(groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };

  const role = String(formData.get("role") ?? "member") as GroupRole;
  const isPayingUser = String(formData.get("isPayingUser") ?? "") === "on";
  const defaultShare = Number(formData.get("defaultShare") ?? 1) || 1;
  const pctRaw = String(formData.get("defaultPercentage") ?? "").trim();
  const amtRaw = String(formData.get("defaultAmount") ?? "").trim();

  const target = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!target) return { ok: false, error: "not_found" };
  if (target.role === "owner" && userId !== user.id) {
    return { ok: false, error: "cannot_edit_owner" };
  }

  await prisma.groupMember.update({
    where: { groupId_userId: { groupId, userId } },
    data: {
      role: target.role === "owner" ? "owner" : role === "owner" ? "admin" : role,
      isPayingUser,
      defaultShare,
      defaultPercentage: pctRaw ? pctRaw : null,
      defaultAmount: amtRaw ? parseMajorInput(amtRaw, m.group.currency) : null,
    },
  });
  await audit({
    groupId,
    actorUserId: user.id,
    action: "member.update",
    entityType: "member",
    entityId: userId,
  });
  await refreshGroupBalances(groupId);
  revalidatePath(`/groups/${groupId}/members`);
  invalidateGroupWorkspace(groupId, [user.id, userId]);
  return { ok: true };
}

export async function removeMember(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const m = await adminOf(groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };
  const target = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!target) return { ok: false, error: "not_found" };
  if (target.role === "owner") return { ok: false, error: "cannot_remove_owner" };

  await prisma.groupMember.delete({
    where: { groupId_userId: { groupId, userId } },
  });
  await audit({
    groupId,
    actorUserId: user.id,
    action: "member.remove",
    entityType: "member",
    entityId: userId,
  });
  await refreshGroupBalances(groupId);
  revalidatePath(`/groups/${groupId}/members`);
  return { ok: true };
}

export async function markGroupEntered(groupId: string) {
  const user = await requireUser();
  await prisma.groupMember.updateMany({
    where: { groupId, userId: user.id, firstEnteredAt: null },
    data: { firstEnteredAt: new Date() },
  });
}
