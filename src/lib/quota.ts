import { prisma } from "./db";
import type { GroupRole } from "@prisma/client";
import { DAILY_CAP, HOURLY_CAP } from "./quota-caps";

export { DAILY_CAP, HOURLY_CAP };

export async function remainingQuota(groupId: string) {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [hourCount, dayCount] = await Promise.all([
    prisma.notificationLog.count({
      where: { groupId, sentAt: { gte: hourAgo } },
    }),
    prisma.notificationLog.count({
      where: { groupId, sentAt: { gte: startOfDay } },
    }),
  ]);

  return {
    hourLeft: Math.max(0, HOURLY_CAP - hourCount),
    dayLeft: Math.max(0, DAILY_CAP - dayCount),
    hourCap: HOURLY_CAP,
    dayCap: DAILY_CAP,
  };
}

export function canSend(q: { hourLeft: number; dayLeft: number }) {
  return q.hourLeft > 0 && q.dayLeft > 0;
}

export function isAdminRole(role: GroupRole) {
  return role === "owner" || role === "admin";
}
