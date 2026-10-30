import { prisma } from "./db";
import { getGroupMembership, invalidateGroupWorkspace } from "./workspace";

export async function refreshGroupBalances(groupId: string) {
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: { userId: true },
  });
  invalidateGroupWorkspace(
    groupId,
    members.map((m) => m.userId),
  );
}

export async function refreshMemberBalance(groupId: string, userId: string) {
  invalidateGroupWorkspace(groupId, [userId]);
  return true;
}

export async function getMembership(groupId: string, userId: string) {
  return getGroupMembership(groupId, userId);
}
