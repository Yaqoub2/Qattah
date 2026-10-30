import "server-only";
import nodemailer from "nodemailer";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "./db";

/** Where a code or reminder goes. Telegram is addressed by phone number. WhatsApp is planned. */
export type Destination = { channel: "email"; email: string } | { channel: "telegram"; phone: string };

const devLog = () => process.env.AUTH_DEV_LOG_OTP === "true";

async function sendEmail(to: string, subject: string, text: string) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (devLog()) return console.info(`[email:dev] to=${to}\n${text}`);
    throw new Error("smtp_not_configured");
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  await nodemailer
    .createTransport({
      host,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
    .sendMail({ from: process.env.SMTP_FROM ?? "Qattah <noreply@localhost>", to, subject, text });
}

/** Telegram bots can only message chats, so the phone must have been shared with the bot first. */
async function sendTelegram(phone: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    if (devLog()) return console.info(`[telegram:dev] to=${phone}\n${text}`);
    throw new Error("telegram_not_configured");
  }
  const chat = await prisma.telegramChat.findUnique({ where: { phone }, select: { chatId: true } });
  if (!chat) throw new Error("telegram_not_linked");
  await telegramApi("sendMessage", { chat_id: chat.chatId.toString(), text });
}

export async function telegramApi(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("telegram_send_failed");
}

export async function send(to: Destination, subject: string, text: string) {
  if (to.channel === "email") return sendEmail(to.email, subject, text);
  return sendTelegram(to.phone, text);
}

/** An email address, or a phone number (codes for phones go through Telegram). */
export function parseIdentifier(raw: string): Destination | null {
  const v = raw.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { channel: "email", email: v };
  const phone = normalizePhone(v);
  return phone ? { channel: "telegram", phone } : null;
}

export const identifierOf = (d: Destination) => (d.channel === "email" ? d.email : d.phone);

/** The users column that holds this identifier. */
export const userKey = (d: Destination) => (d.channel === "email" ? { email: d.email } : { phone: d.phone });

/** Where to reach an existing user: email first, otherwise Telegram. */
export function destinationOf(u: { email: string | null; phone: string | null }): Destination | null {
  if (u.email) return { channel: "email", email: u.email };
  if (u.phone) return { channel: "telegram", phone: u.phone };
  return null;
}
