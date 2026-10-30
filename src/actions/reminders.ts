"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getMembership } from "@/lib/balances";
import { isAdminRole, remainingQuota, canSend } from "@/lib/quota";
import { sendEmail } from "@/lib/email";
import { sendWhatsApp } from "@/lib/whatsapp";
import { formatMoney } from "@/lib/money";
import { collectedOf } from "@/lib/ledger";
import { revalidatePath } from "next/cache";

export type ActionResult =
  | { ok: true; remaining: { hourLeft: number; dayLeft: number } }
  | { ok: false; error: string };

type Channel = "whatsapp" | "email";

export async function sendReminder(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const m = await getMembership(groupId, user.id);
  if (!m || !isAdminRole(m.role)) return { ok: false, error: "forbidden" };

  const quota = await remainingQuota(groupId);
  if (!canSend(quota)) return { ok: false, error: "quota_exceeded" };

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "body_required" };

  const channels = formData
    .getAll("channels")
    .map((c) => String(c))
    .filter((c): c is Channel => c === "whatsapp" || c === "email");
  if (channels.length === 0) return { ok: false, error: "no_channel" };

  const targetType = String(formData.get("targetType") ?? "group");
  const targetId = String(formData.get("targetId") ?? "") || null;
  const recipientIds = String(formData.get("recipientIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const members = await prisma.groupMember.findMany({
    where: {
      groupId,
      ...(recipientIds.length ? { userId: { in: recipientIds } } : {}),
    },
    include: { user: true },
  });

  const jobs: { channel: Channel; to: string; userId: string }[] = [];
  for (const mem of members) {
    for (const channel of channels) {
      const to = channel === "email" ? mem.user.email : mem.user.phone;
      if (to) jobs.push({ channel, to, userId: mem.userId });
    }
  }

  if (jobs.length === 0) return { ok: false, error: "no_recipients" };

  let sent = 0;
  for (const job of jobs) {
    const left = await remainingQuota(groupId);
    if (!canSend(left)) {
      if (sent === 0) return { ok: false, error: "quota_exceeded" };
      break;
    }
    try {
      if (job.channel === "email") {
        await sendEmail(job.to, "قطة", body);
      } else {
        await sendWhatsApp(job.to, body);
      }
    } catch (e) {
      console.error(e);
    }
    await prisma.notificationLog.create({
      data: {
        groupId,
        actorUserId: user.id,
        channel: job.channel,
        targetType,
        targetId,
        recipient: job.to,
        body,
      },
    });
    sent += 1;
  }

  revalidatePath(`/groups/${groupId}`);
  return { ok: true, remaining: await remainingQuota(groupId) };
}

export async function expenseCollectTemplate(groupId: string, expenseId: string, locale: string) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, groupId },
    include: {
      group: true,
      shares: true,
      payers: true,
      allocations: { include: { payment: true } },
    },
  });
  if (!expense) return "";
  const collected = collectedOf(expense);
  const left = Math.max(0, expense.amount - collected);
  const app = process.env.APP_URL ?? "";
  const moneyLeft = formatMoney(left, expense.group.currency, locale);
  const total = formatMoney(expense.amount, expense.group.currency, locale);
  if (locale === "en") {
    return `Reminder from ${expense.group.name}: "${expense.title}" still needs ${moneyLeft} of ${total}. Pay here: ${app}`;
  }
  return `تذكير من مجموعة ${expense.group.name}: المصروف «${expense.title}» ما اكتمل بعد. المتبقي ${moneyLeft} من أصل ${total}. ادفع من هنا: ${app}`;
}
