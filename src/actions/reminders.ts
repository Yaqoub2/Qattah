"use server";

import { z } from "zod";
import { prisma } from "@/server/db";
import { actionMember, ActionError } from "@/server/guard";
import { f, formAction } from "@/server/action";
import { destinationOf, send } from "@/server/channels";
import { computeGroupLedger } from "@/server/group-ledger";
import { loadGroup } from "@/server/queries";
import { REMINDER_COOLDOWN_HOURS } from "@/lib/limits";
import { formatMoney } from "@/lib/money";

/**
 * Admin sends a member what they owe, by email or Telegram.
 * Queries: membership check; last reminder (index group_id, user_id, sent_at); group with members; ledger (3); one INSERT.
 */
export const sendReminder = formAction(z.object({ groupId: f.id, userId: f.id }), async ({ groupId, userId }) => {
  const { user } = await actionMember(groupId, { admin: true });
  const last = await prisma.reminder.findFirst({
    where: { groupId, userId, sentAt: { gt: new Date(Date.now() - REMINDER_COOLDOWN_HOURS * 3_600_000) } },
    select: { id: true },
  });
  if (last) throw new ActionError("reminder_too_soon");

  const groupP = loadGroup(groupId, user.id);
  const [group, ledger] = await Promise.all([groupP, computeGroupLedger(groupId, groupP)]);
  const target = group?.members.find((m) => m.userId === userId);
  if (!group || !ledger || !target) throw new ActionError("not_member");
  const { byUser } = ledger;
  const owed = -(byUser[userId]?.balance ?? 0);
  if (owed <= 0) throw new ActionError("nothing_owed");

  const ar = target.locale === "ar";
  const amount = formatMoney(owed, group.currency, target.locale);
  const link = `${process.env.APP_URL ?? ""}/${target.locale}/groups/${groupId}/payments`;
  const text = ar
    ? `تذكير من ${group.name}: عليك ${amount}.\nطرق الدفع وتسجيل الدفعة: ${link}`
    : `Reminder from ${group.name}: you owe ${amount}.\nPay and record it here: ${link}`;
  const to = destinationOf(target);
  if (!to) throw new ActionError("no_contact");

  try {
    await send(to, ar ? `تذكير — ${group.name}` : `Reminder — ${group.name}`, text);
  } catch (e) {
    throw new ActionError(e instanceof Error && e.message === "telegram_not_linked" ? "telegram_not_linked" : "send_failed");
  }
  await prisma.reminder.create({ data: { groupId, userId, sentById: user.id, channel: to.channel, amount: owed } });
});
