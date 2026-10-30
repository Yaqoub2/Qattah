import { normalizePhone } from "@/lib/phone";
import { telegramApi } from "@/server/channels";
import { prisma } from "@/server/db";

type Update = {
  message?: {
    chat?: { id?: number; type?: string };
    from?: { id?: number };
    contact?: { phone_number?: string; user_id?: number };
  };
};

const ASK = "شارك رقم جوالك لاستلام رموز قطة هنا.\nShare your phone number to receive Qattah codes here.";
const BUTTON = "📱 مشاركة رقمي · Share my number";
const LINKED = "تم الربط ✓ ارجع إلى قطة واطلب الرمز.\nLinked ✓ Go back to Qattah and request your code.";
const NOT_YOURS = "شارك رقمك أنت عبر الزر.\nPlease share your own number using the button.";

/**
 * Telegram bot webhook (setWebhook with secret_token = TELEGRAM_WEBHOOK_SECRET).
 * Any message: reply with a "share my number" button.
 * A shared contact: only if it is the sender's own number, store phone -> chat (one transaction).
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }
  const msg = ((await req.json().catch(() => ({}))) as Update).message;
  const chatId = msg?.chat?.id;
  if (!chatId || msg.chat?.type !== "private") return Response.json({ ok: true });

  const contact = msg.contact;
  if (!contact) {
    await reply(chatId, ASK, {
      keyboard: [[{ text: BUTTON, request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    });
    return Response.json({ ok: true });
  }

  const phone = contact.phone_number ? normalizePhone(contact.phone_number.startsWith("+") ? contact.phone_number : `+${contact.phone_number}`) : null;
  if (!phone || !msg.from?.id || contact.user_id !== msg.from.id) {
    await reply(chatId, NOT_YOURS);
    return Response.json({ ok: true });
  }

  const chat = BigInt(chatId);
  await prisma.$transaction([
    prisma.telegramChat.deleteMany({ where: { chatId: chat, phone: { not: phone } } }),
    prisma.telegramChat.upsert({ where: { phone }, create: { phone, chatId: chat }, update: { chatId: chat } }),
  ]);
  await reply(chatId, LINKED, { remove_keyboard: true });
  return Response.json({ ok: true });
}

function reply(chatId: number, text: string, reply_markup?: Record<string, unknown>) {
  return telegramApi("sendMessage", { chat_id: chatId, text, ...(reply_markup ? { reply_markup } : {}) }).catch(() => undefined);
}
