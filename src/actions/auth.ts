"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { identifierOf, parseIdentifier, send, userKey } from "@/server/channels";
import { hashOtp, OTP_DAILY_CAP, OTP_MAX_ATTEMPTS, OTP_TTL_MS, randomOtp, verifyOtpHash } from "@/server/otp";
import { createSession, destroySession } from "@/server/session";

type Result = { ok: true; newUser: boolean } | { ok: false; error: string };


/** Queries: users by unique identifier; otp count in the last 24h (index identifier, created_at); one insert. */
export async function requestCode(rawIdentifier: string): Promise<Result> {
  const to = parseIdentifier(rawIdentifier);
  if (!to) return { ok: false, error: "invalid_identifier" };
  const identifier = identifierOf(to);

  const [user, recent] = await Promise.all([
    prisma.user.findUnique({ where: userKey(to), select: { id: true } }),
    prisma.otpChallenge.count({ where: { identifier, createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
  ]);
  if (recent >= OTP_DAILY_CAP) return { ok: false, error: "too_many_codes" };

  const code = randomOtp();
  try {
    await send(to, "Qattah code / رمز قطة", `${code}\n\nقطة — رمز الدخول · Qattah sign-in code`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { ok: false, error: msg === "telegram_not_linked" ? msg : "send_failed" };
  }
  await prisma.otpChallenge.create({
    data: { identifier, channel: to.channel, codeHash: await hashOtp(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  return { ok: true, newUser: !user };
}

/** Queries: latest challenge for the identifier; attempt update or delete; user find/create; session insert. */
export async function verifyCode(input: { identifier: string; code: string; name?: string; locale: string }): Promise<Result> {
  const to = parseIdentifier(input.identifier);
  if (!to) return { ok: false, error: "invalid_identifier" };
  if (!/^\d{6}$/.test(input.code)) return { ok: false, error: "invalid_code" };
  const identifier = identifierOf(to);

  const challenge = await prisma.otpChallenge.findFirst({
    where: { identifier, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true, attempts: true },
  });
  if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: "code_expired" };
  if (!(await verifyOtpHash(input.code, challenge.codeHash))) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: "wrong_code" };
  }

  let user = await prisma.user.findUnique({ where: userKey(to), select: { id: true } });
  if (!user) {
    const name = input.name?.trim();
    if (!name) return { ok: false, error: "name_required" };
    user = await prisma.user.create({
      data: { name: name.slice(0, 80), locale: input.locale === "en" ? "en" : "ar", ...userKey(to) },
      select: { id: true },
    });
  }
  await prisma.otpChallenge.deleteMany({ where: { identifier } });
  await createSession(user.id);
  return { ok: true, newUser: false };
}

export async function logout(locale: string) {
  await destroySession();
  redirect(`/${locale === "en" ? "en" : "ar"}/login`);
}
