"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { getMembership, refreshGroupBalances } from "@/lib/balances";
import { invalidateGroupWorkspace } from "@/lib/workspace";
import { isAdminRole } from "@/lib/quota";
import { parseMajorInput } from "@/lib/money";
import { allocationTake, leftover } from "@/lib/ledger";
import { fileFromForm, uploadPublicFile } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { ensureAnonymousUser, findOrCreateGuestUser } from "@/lib/anonymous";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function parseJsonArray<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function resolvePayer(formData: FormData, groupId: string, actorId: string, isAdmin: boolean) {
  const payerKind = String(formData.get("payerKind") ?? "member");
  if (payerKind === "anonymous") {
    if (!isAdmin) return { ok: false as const, error: "forbidden" };
    return { ok: true as const, payerUserId: (await ensureAnonymousUser()).id, payerKind };
  }
  if (payerKind === "guest") {
    if (!isAdmin) return { ok: false as const, error: "forbidden" };
    const guest = await findOrCreateGuestUser({
      name: String(formData.get("guestName") ?? ""),
      identifier: String(formData.get("identifier") ?? ""),
    });
    if (!guest.ok) return { ok: false as const, error: guest.error };
    return { ok: true as const, payerUserId: guest.id, payerKind };
  }
  const payerUserId = String(formData.get("payerUserId") ?? actorId);
  const inGroup = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: payerUserId } },
  });
  if (!inGroup) return { ok: false as const, error: "not_member" };
  return { ok: true as const, payerUserId, payerKind };
}

async function parsePaymentBody(formData: FormData, currency: string) {
  const amount = parseMajorInput(String(formData.get("amount") ?? ""), currency);
  if (amount === null || amount <= 0) return { ok: false as const, error: "invalid_amount" };
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const allocations = parseJsonArray<{ expenseId: string; amount: number }[]>(
    String(formData.get("allocations") ?? "[]"),
    [],
  ).filter((a) => a.amount > 0);
  return { ok: true as const, amount, notes, allocations };
}

async function clampAllocations(
  requested: { expenseId: string; amount: number }[],
  paymentAmount: number,
  excludePaymentId?: string,
) {
  if (requested.length === 0) return [];
  const ids = [...new Set(requested.map((a) => a.expenseId))];
  const expenses = await prisma.expense.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      amount: true,
      allocations: { select: { paymentId: true, amount: true } },
    },
  });
  const byId = new Map(expenses.map((e) => [e.id, e]));
  let payLeft = paymentAmount;
  const rows: { expenseId: string; amount: number }[] = [];
  for (const a of requested) {
    if (payLeft <= 0) break;
    const expense = byId.get(a.expenseId);
    if (!expense) continue;
    const already = expense.allocations
      .filter((x) => x.paymentId !== excludePaymentId)
      .reduce((s, x) => s + x.amount, 0);
    const take = allocationTake(payLeft, leftover(expense.amount, already));
    const use = Math.min(take, a.amount);
    if (use <= 0) continue;
    rows.push({ expenseId: a.expenseId, amount: use });
    payLeft -= use;
  }
  return rows;
}

async function maybeReceipt(formData: FormData, groupId: string, current?: string | null) {
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    const { bytes, contentType } = await fileFromForm(file);
    return uploadPublicFile({
      path: `payments/${groupId}/${crypto.randomUUID()}-${file.name}`,
      bytes,
      contentType,
    });
  }
  return current ?? null;
}

export async function createPayment(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const m = await getMembership(groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };
  const isAdmin = isAdminRole(m.role);
  if (!isAdmin && !m.group.membersCanSubmit) return { ok: false, error: "forbidden" };

  const payer = await resolvePayer(formData, groupId, user.id, isAdmin);
  if (!payer.ok) return payer;
  const body = await parsePaymentBody(formData, m.group.currency);
  if (!body.ok) return body;
  const receiptUrl = await maybeReceipt(formData, groupId);
  const requestedIds = [...new Set(body.allocations.map((a) => a.expenseId))];
  const allowed =
    requestedIds.length === 0
      ? []
      : await prisma.expense.findMany({
          where: { id: { in: requestedIds }, groupId, approvalStatus: "approved" },
          select: { id: true },
        });
  const allowedIds = new Set(allowed.map((e) => e.id));
  const allocations = body.allocations.filter((a) => allowedIds.has(a.expenseId));

  const payment = await prisma.payment.create({
    data: {
      groupId,
      payerUserId: payer.payerUserId,
      amount: body.amount,
      notes: body.notes,
      receiptUrl,
      approvalStatus: "pending",
      allocations: {
        create: allocations,
      },
    },
  });

  await audit({
    groupId,
    actorUserId: user.id,
    action: "payment.submit",
    entityType: "payment",
    entityId: payment.id,
    metadata: { amount: body.amount, payerKind: payer.payerKind },
  });
  invalidateGroupWorkspace(groupId, [user.id]);
  revalidatePath(`/groups/${groupId}`);
  return { ok: true, id: payment.id };
}

export async function updatePayment(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const paymentId = String(formData.get("paymentId") ?? "");
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false, error: "not_found" };
  if (payment.approvalStatus !== "pending") return { ok: false, error: "already_approved" };
  const m = await getMembership(payment.groupId, user.id);
  if (!m) return { ok: false, error: "forbidden" };
  const isAdmin = isAdminRole(m.role);
  if (!isAdmin && payment.payerUserId !== user.id) return { ok: false, error: "forbidden" };

  const body = await parsePaymentBody(formData, m.group.currency);
  if (!body.ok) return body;
  const receiptUrl = await maybeReceipt(formData, payment.groupId, payment.receiptUrl);

  let payerUserId = payment.payerUserId;
  if (isAdmin) {
    const kind = String(formData.get("payerKind") ?? "member");
    if (kind === "guest" || kind === "anonymous") {
      const payer = await resolvePayer(formData, payment.groupId, user.id, true);
      if (!payer.ok) return payer;
      payerUserId = payer.payerUserId;
    } else {
      const requested = String(formData.get("payerUserId") ?? payment.payerUserId);
      const inGroup = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: payment.groupId, userId: requested } },
      });
      if (inGroup) payerUserId = requested;
    }
  }

  const requestedIds = [...new Set(body.allocations.map((a) => a.expenseId))];
  const allowed =
    requestedIds.length === 0
      ? []
      : await prisma.expense.findMany({
          where: { id: { in: requestedIds }, groupId: payment.groupId, approvalStatus: "approved" },
          select: { id: true },
        });
  const allowedIds = new Set(allowed.map((e) => e.id));
  const allocations = body.allocations.filter((a) => allowedIds.has(a.expenseId));

  await prisma.$transaction([
    prisma.paymentAllocation.deleteMany({ where: { paymentId } }),
    prisma.payment.update({
      where: { id: paymentId },
      data: {
        payerUserId,
        amount: body.amount,
        notes: body.notes,
        receiptUrl,
        allocations: {
          create: allocations,
        },
      },
    }),
  ]);

  await audit({
    groupId: payment.groupId,
    actorUserId: user.id,
    action: "payment.update",
    entityType: "payment",
    entityId: paymentId,
    metadata: { amount: body.amount },
  });
  invalidateGroupWorkspace(payment.groupId, [user.id]);
  revalidatePath(`/groups/${payment.groupId}`);
  return { ok: true, id: paymentId };
}

export async function setPaymentApproval(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const paymentId = String(formData.get("paymentId") ?? "");
  const status = String(formData.get("status") ?? "") as "approved" | "rejected";
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { allocations: true },
  });
  if (!payment) return { ok: false, error: "not_found" };
  const m = await getMembership(payment.groupId, user.id);
  if (!m || !isAdminRole(m.role)) return { ok: false, error: "forbidden" };

  if (status === "approved") {
    const clamped = await clampAllocations(
      payment.allocations.map((a) => ({ expenseId: a.expenseId, amount: a.amount })),
      payment.amount,
      paymentId,
    );
    await prisma.$transaction([
      prisma.paymentAllocation.deleteMany({ where: { paymentId } }),
      prisma.payment.update({
        where: { id: paymentId },
        data: {
          approvalStatus: "approved",
          allocations: { create: clamped },
        },
      }),
    ]);
    await refreshGroupBalances(payment.groupId);
  } else {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { approvalStatus: status },
    });
    invalidateGroupWorkspace(payment.groupId, [user.id]);
  }
  await audit({
    groupId: payment.groupId,
    actorUserId: user.id,
    action: `payment.${status}`,
    entityType: "payment",
    entityId: paymentId,
  });
  revalidatePath(`/groups/${payment.groupId}`);
  return { ok: true, id: paymentId };
}

export async function deletePayment(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const paymentId = String(formData.get("paymentId") ?? "");
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false, error: "not_found" };
  const m = await getMembership(payment.groupId, user.id);
  if (!m || !isAdminRole(m.role)) return { ok: false, error: "forbidden" };
  if (payment.approvalStatus === "approved") return { ok: false, error: "already_approved" };

  await prisma.payment.delete({ where: { id: paymentId } });
  await audit({
    groupId: payment.groupId,
    actorUserId: user.id,
    action: "payment.delete",
    entityType: "payment",
    entityId: paymentId,
  });
  invalidateGroupWorkspace(payment.groupId, [user.id]);
  revalidatePath(`/groups/${payment.groupId}`);
  return { ok: true, id: paymentId };
}
