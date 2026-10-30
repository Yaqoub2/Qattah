import { prisma } from "./db";
import { Prisma } from "@prisma/client";

export async function audit(input: {
  groupId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.groupAuditLog.create({
    data: {
      groupId: input.groupId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}
