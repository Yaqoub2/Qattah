import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { prisma } from "./db";
import { forgetPrefix, forgetTag, remember, rememberSet } from "./memo-cache";

const COOKIE = "qattah_session";

function secret() {
  const s = process.env.SESSION_SECRET ?? "dev-only-change-me-please-32chars!!";
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await prisma.session.create({ data: { userId, token, expiresAt } });
  const jwt = await new SignJWT({ uid: userId, sid: token })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) rememberSet(`session:${token}`, user, 120_000, [`session:${token}`, `user:${userId}`]);
}

export async function destroySession() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) {
    try {
      const { payload } = await jwtVerify(raw, secret());
      const sid = payload.sid as string | undefined;
      const uid = payload.uid as string | undefined;
      if (sid) {
        await prisma.session.deleteMany({ where: { token: sid } });
        forgetPrefix(`session:${sid}`);
        forgetTag(`session:${sid}`);
        if (uid) {
          forgetTag(`user:${uid}`);
          forgetPrefix(`user:${uid}:`);
        }
      } else if (uid) {
        forgetTag(`user:${uid}`);
        forgetPrefix(`user:${uid}:`);
      }
    } catch {
      /* ignore */
    }
  }
  jar.delete(COOKIE);
}

async function loadSessionUser() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    const uid = payload.uid as string;
    const sid = payload.sid as string;
    return remember(`session:${sid}`, [`session:${sid}`, `user:${uid}`], 120_000, async () => {
      const session = await prisma.session.findUnique({
        where: { token: sid },
        include: { user: true },
      });
      if (!session || session.expiresAt < new Date() || session.userId !== uid) return null;
      if (session.user.status === "disabled") return null;
      return session.user;
    });
  } catch {
    return null;
  }
}

export const getSessionUser = cache(loadSessionUser);

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("unauthenticated");
  return user;
}
