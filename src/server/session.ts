import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { prisma } from "./db";

const COOKIE = "qattah_session";
const TTL_DAYS = 30;

/**
 * The signed cookie carries the user, so pages need no query to know who is signed in.
 * Writes still check the sessions row (see guard.ts), so logging out revokes write access at once.
 */
export type SessionUser = { id: string; name: string; email: string | null; phone: string | null; locale: string };
type Claims = { sid: string; user: SessionUser };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

async function writeCookie(claims: Claims, expiresAt: Date) {
  const jwt = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setExpirationTime(expiresAt).sign(secret());
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** One INSERT into sessions, plus a SELECT of the user for the cookie. */
export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000);
  const { id, user } = await prisma.session.create({
    data: { userId, expiresAt },
    select: { id: true, user: { select: { id: true, name: true, email: true, phone: true, locale: true } } },
  });
  await writeCookie({ sid: id, user }, expiresAt);
}

const readClaims = cache(async (): Promise<(Claims & { exp: number }) | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    const { sid, user, exp } = payload as Partial<Claims> & { exp?: number };
    return typeof sid === "string" && user?.id && exp ? { sid, user, exp } : null;
  } catch {
    return null;
  }
});

/** No database query: the user comes from the signed cookie. */
export const getSessionUser = cache(async () => (await readClaims())?.user ?? null);

export async function sessionId() {
  return (await readClaims())?.sid ?? null;
}

/** After a profile change: same session and expiry, new user details in the cookie. */
export async function refreshSessionUser(changes: Partial<Pick<SessionUser, "name" | "locale">>) {
  const claims = await readClaims();
  if (!claims) return;
  await writeCookie({ sid: claims.sid, user: { ...claims.user, ...changes } }, new Date(claims.exp * 1000));
}

export async function destroySession() {
  const sid = await sessionId();
  if (sid) await prisma.session.deleteMany({ where: { id: sid } });
  (await cookies()).delete(COOKIE);
}
