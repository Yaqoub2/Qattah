"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getMembership } from "@/lib/balances";
import { isAdminRole } from "@/lib/quota";
import { audit } from "@/lib/audit";
import { fileFromForm, uploadPublicFile } from "@/lib/storage";
import { mergeTypeList } from "@/lib/payment-types";
import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/routing";
import { invalidateGroupWorkspace, invalidateUserWorkspace } from "@/lib/workspace";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

async function uploadQr(formData: FormData, prefix: string): Promise<string | null> {
  const file = formData.get("qr");
  if (!(file instanceof File) || file.size <= 0) return null;
  const { bytes, contentType } = await fileFromForm(file);
  return uploadPublicFile({
    path: `${prefix}/${crypto.randomUUID()}-${file.name}`,
    bytes,
    contentType,
  });
}

function selectedType(formData: FormData): string {
  const type = String(formData.get("type") ?? "iban");
  return type === "qr" || type === "link" ? type : "iban";
}

function fieldsForType(formData: FormData, type: string, qrImageUrl: string | null) {
  if (type === "iban") {
    return {
      iban: String(formData.get("iban") ?? "").trim() || null,
      beneficiaryName: String(formData.get("beneficiaryName") ?? "").trim() || null,
    };
  }
  if (type === "qr") {
    return { qrImageUrl };
  }
  return { linkUrl: String(formData.get("linkUrl") ?? "").trim() || null };
}

export async function addUserPaymentMethod(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const type = selectedType(formData);
  const qrImageUrl = type === "qr" ? await uploadQr(formData, `methods/${user.id}`) : null;
  const label = String(formData.get("label") ?? "").trim() || "طريقة دفع";
  const isDefault = String(formData.get("isDefault") ?? "") === "on";
  if (isDefault) {
    await prisma.userPaymentMethod.updateMany({
      where: { userId: user.id },
      data: { isDefault: false },
    });
  }
  const row = await prisma.userPaymentMethod.create({
    data: {
      userId: user.id,
      type,
      label,
      isDefault,
      ...fieldsForType(formData, type, qrImageUrl),
    },
  });
  revalidatePath("/profile");
  invalidateUserWorkspace(user.id);
  return { ok: true, id: row.id };
}

export async function updateUserPaymentMethod(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.userPaymentMethod.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return { ok: false, error: "not_found" };
  const type = selectedType(formData);
  const qrImageUrl = type === "qr" ? await uploadQr(formData, `methods/${user.id}`) : null;
  const extra = fieldsForType(formData, type, qrImageUrl);
  const row = await prisma.userPaymentMethod.update({
    where: { id },
    data: {
      type: mergeTypeList(existing.type, type),
      ...(type === "qr" && !qrImageUrl ? {} : extra),
    },
  });
  revalidatePath("/profile");
  invalidateUserWorkspace(user.id);
  return { ok: true, id: row.id };
}

export async function deleteUserPaymentMethod(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  await prisma.userPaymentMethod.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/profile");
  invalidateUserWorkspace(user.id);
  return { ok: true };
}

export async function addGroupPaymentMethod(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const m = await getMembership(groupId, user.id);
  if (!m || !isAdminRole(m.role)) return { ok: false, error: "forbidden" };
  const type = selectedType(formData);
  const qrImageUrl = type === "qr" ? await uploadQr(formData, `group-methods/${groupId}`) : null;
  const label = String(formData.get("label") ?? "").trim() || "طريقة دفع";
  const isDefault = String(formData.get("isDefault") ?? "") === "on";
  if (isDefault) {
    await prisma.groupPaymentMethod.updateMany({
      where: { groupId },
      data: { isDefault: false },
    });
  }
  const sourceUserId = String(formData.get("sourceUserId") ?? "") || null;
  const row = await prisma.groupPaymentMethod.create({
    data: {
      groupId,
      sourceUserId,
      type,
      label,
      isDefault,
      ...fieldsForType(formData, type, qrImageUrl),
    },
  });
  await audit({
    groupId,
    actorUserId: user.id,
    action: "payment_method.add",
    entityType: "group_payment_method",
    entityId: row.id,
  });
  revalidatePath(`/groups/${groupId}/settings`);
  invalidateGroupWorkspace(groupId, [user.id]);
  return { ok: true, id: row.id };
}

export async function updateGroupPaymentMethod(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const id = String(formData.get("id") ?? "");
  const m = await getMembership(groupId, user.id);
  if (!m || !isAdminRole(m.role)) return { ok: false, error: "forbidden" };
  const existing = await prisma.groupPaymentMethod.findFirst({
    where: { id, groupId },
  });
  if (!existing) return { ok: false, error: "not_found" };
  const type = selectedType(formData);
  const qrImageUrl = type === "qr" ? await uploadQr(formData, `group-methods/${groupId}`) : null;
  const extra = fieldsForType(formData, type, qrImageUrl);
  const row = await prisma.groupPaymentMethod.update({
    where: { id },
    data: {
      type: mergeTypeList(existing.type, type),
      ...(type === "qr" && !qrImageUrl ? {} : extra),
    },
  });
  revalidatePath(`/groups/${groupId}/settings`);
  invalidateGroupWorkspace(groupId, [user.id]);
  return { ok: true, id: row.id };
}

export async function copyUserMethodToGroup(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const methodId = String(formData.get("methodId") ?? "");
  const m = await getMembership(groupId, user.id);
  if (!m || !isAdminRole(m.role)) return { ok: false, error: "forbidden" };
  const method = await prisma.userPaymentMethod.findUnique({ where: { id: methodId } });
  if (!method) return { ok: false, error: "not_found" };
  const row = await prisma.groupPaymentMethod.create({
    data: {
      groupId,
      sourceUserId: method.userId,
      type: method.type,
      label: method.label,
      iban: method.iban,
      beneficiaryName: method.beneficiaryName,
      qrImageUrl: method.qrImageUrl,
      linkUrl: method.linkUrl,
      details: method.details,
    },
  });
  revalidatePath(`/groups/${groupId}/settings`);
  invalidateGroupWorkspace(groupId, [user.id]);
  return { ok: true, id: row.id };
}

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const locale = String(formData.get("locale") ?? user.locale) === "en" ? "en" : "ar";
  if (!name) return { ok: false, error: "name_required" };
  await prisma.user.update({
    where: { id: user.id },
    data: { name, locale },
  });
  invalidateUserWorkspace(user.id);
  redirect({ href: "/profile", locale });
  return { ok: true };
}
