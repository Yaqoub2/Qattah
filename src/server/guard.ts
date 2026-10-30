import "server-only";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/routing";
import { prisma } from "./db";
import { getSessionUser, sessionId } from "./session";
import { loadGroup } from "./queries";

export const isAdmin = (role: string) => role === "owner" || role === "admin";

/** Pages: send signed-out users to login. No query. */
export async function pageUser() {
  const user = await getSessionUser();
  if (!user) redirect({ href: "/login", locale: await getLocale() });
  return user!;
}

/**
 * Pages: the group plus the signed-in user, or 404 if they are not a member.
 * The membership check is part of loadGroup (one query), so pages can run it in parallel with their data.
 */
export async function pageGroup(groupId: string) {
  const user = await pageUser();
  const group = await loadGroup(groupId, user.id);
  if (!group) notFound();
  return { user, group, admin: isAdmin(group.me.role) };
}

export class ActionError extends Error {}

/** Actions without a group: one PK lookup confirms the session was not revoked. */
export async function actionUser() {
  const [user, sid] = await Promise.all([getSessionUser(), sessionId()]);
  if (!user || !sid) throw new ActionError("unauthenticated");
  const live = await prisma.session.count({ where: { id: sid, userId: user.id, expiresAt: { gt: new Date() } } });
  if (!live) throw new ActionError("unauthenticated");
  return user;
}

/** Actions in a group: live session, membership, role and currency in one query (PKs of sessions and group_members). */
export async function actionMember(groupId: string, opts: { admin?: boolean } = {}) {
  const [user, sid] = await Promise.all([getSessionUser(), sessionId()]);
  if (!user || !sid) throw new ActionError("unauthenticated");
  const [row] = await prisma.$queryRaw<{ role: string | null; currency: string | null }[]>`
    SELECT gm.role::text AS role, g.currency
    FROM sessions s
    LEFT JOIN group_members gm ON gm.user_id = s.user_id AND gm.group_id = ${groupId}::uuid
    LEFT JOIN groups g ON g.id = gm.group_id
    WHERE s.id = ${sid}::uuid AND s.user_id = ${user.id}::uuid AND s.expires_at > now()`;
  if (!row) throw new ActionError("unauthenticated");
  if (!row.role || !row.currency) throw new ActionError("not_member");
  if (opts.admin && !isAdmin(row.role)) throw new ActionError("admin_only");
  return { user, admin: isAdmin(row.role), currency: row.currency };
}
