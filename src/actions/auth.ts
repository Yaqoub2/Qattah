"use server";

import { prisma } from "@/lib/db";
import { detectIdentifier } from "@/lib/identity";
import { isAnonymousPhone } from "@/lib/anonymous";
import { hashOtp, OTP_DAILY_SEND_CAP, OTP_MAX_ATTEMPTS, randomOtp, verifyOtpHash } from "@/lib/otp";
import { sendEmail } from "@/lib/email";
import { sendWhatsApp } from "@/lib/whatsapp";
import { createSession, destroySession } from "@/lib/session";
import { warmAfterLogin } from "@/lib/workspace";
import { redirect } from "next/navigation";

export type OtpRequestResult =
  | { ok: true; message: string; knownName: string | null }
  | { ok: false; error: string };

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function startOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function requestOtp(formData: FormData): Promise<OtpRequestResult> {
  const raw = String(formData.get("identifier") ?? "");
  const detected = detectIdentifier(raw);
  if (!detected) return { ok: false, error: "invalid_identifier" };
  if (detected.phone && isAnonymousPhone(detected.phone)) return { ok: false, error: "invalid_identifier" };

  const channel = detected.email ? "email" : "whatsapp";
  const identifier = detected.email ?? detected.phone!;

  const user = detected.email
    ? await prisma.user.findUnique({ where: { email: detected.email } })
    : await prisma.user.findUnique({ where: { phone: detected.phone } });

  const sentToday = await prisma.otpChallenge.count({
    where: { identifier, createdAt: { gte: startOfUtcDay() } },
  });
  if (sentToday >= OTP_DAILY_SEND_CAP) return { ok: false, error: "too_many_otp" };

  const code = randomOtp();
  const codeHash = await hashOtp(code);
  await prisma.otpChallenge.create({
    data: {
      userId: user?.id,
      identifier,
      channel,
      codeHash,
      expiresAt: new Date("9999-12-31T23:59:59.000Z"),
    },
  });

  const app = process.env.APP_URL ?? "http://localhost:3000";
  try {
    if (channel === "email") {
      await sendEmail(identifier, "رمز الدخول — قطة", `رمزك: ${code}\n${app}`);
    } else {
      const tpl = process.env.WHATSAPP_OTP_TEMPLATE;
      await sendWhatsApp(
        identifier,
        `رمز قطة: ${code}`,
        tpl ? { name: tpl, params: [code] } : undefined,
      );
    }
  } catch (e) {
    console.error(e);
    return { ok: false, error: "send_failed" };
  }

  const knownName = user?.name?.trim() ? user.name.trim() : null;
  return { ok: true, message: identifier, knownName };
}

export async function verifyOtp(formData: FormData): Promise<ActionResult> {
  const raw = String(formData.get("identifier") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const locale = String(formData.get("locale") ?? "ar");
  const detected = detectIdentifier(raw);
  if (!detected) return { ok: false, error: "invalid_identifier" };
  if (detected.phone && isAnonymousPhone(detected.phone)) return { ok: false, error: "invalid_identifier" };
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "invalid_code" };

  const identifier = detected.email ?? detected.phone!;
  const challenge = await prisma.otpChallenge.findFirst({
    where: { identifier },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) return { ok: false, error: "no_challenge" };
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: "too_many_attempts" };

  const match = await verifyOtpHash(code, challenge.codeHash);
  if (!match) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "wrong_code" };
  }

  let user = detected.email
    ? await prisma.user.findUnique({ where: { email: detected.email } })
    : await prisma.user.findUnique({ where: { phone: detected.phone } });

  if (!user) {
    if (!name) return { ok: false, error: "name_required" };
    user = await prisma.user.create({
      data: {
        name,
        locale: locale === "en" ? "en" : "ar",
        status: "active",
        claimedAt: new Date(),
        email: detected.email,
        phone: detected.phone,
      },
    });
  } else if (user.status === "disabled") {
    return { ok: false, error: "invalid_identifier" };
  } else if (user.status !== "active") {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        status: "active",
        claimedAt: new Date(),
        locale: locale === "en" ? "en" : user.locale,
      },
    });
  }

  await createSession(user.id);
  void warmAfterLogin(user.id);
  return { ok: true };
}

export async function logout() {
  await destroySession();
  redirect("/");
}
