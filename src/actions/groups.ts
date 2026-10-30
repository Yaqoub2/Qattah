"use server";

import { z } from "zod";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { prisma } from "@/server/db";
import { actionMember, actionUser, ActionError } from "@/server/guard";
import { f, formAction, toSplitColumns } from "@/server/action";
import { parseIdentifier, userKey } from "@/server/channels";

/** One INSERT into groups with a nested INSERT of the owner into group_members (single transaction). */
export const createGroup = formAction(
  z.object({ name: f.text(80), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/) }),
  async ({ name, currency }) => {
    const user = await actionUser();
    const group = await prisma.group.create({
      data: {
        name,
        currency,
        createdById: user.id,
        members: { create: { userId: user.id, role: "owner", isPaying: true, splitMethod: "shares", splitValue: 1 } },
      },
      select: { id: true },
    });
    redirect({ href: `/groups/${group.id}`, locale: await getLocale() });
  },
);

const memberFields = {
  groupId: f.id,
  isPaying: f.checkbox,
  startsOn: f.date,
  splitMethod: f.splitMethod,
  splitValue: f.splitValue,
};

/** Finds or creates the user by email or phone, then inserts group_members. */
export const addMember = formAction(
  z.object({ ...memberFields, name: f.text(80), identifier: f.text(120) }),
  async (input) => {
    const { currency } = await actionMember(input.groupId, { admin: true });
    const to = parseIdentifier(input.identifier);
    if (!to) throw new ActionError("invalid_identifier");
    const key = userKey(to);
    const split = toSplitColumns(input.splitMethod, input.splitValue, currency);
    await prisma.$transaction(async (tx) => {
      const user =
        (await tx.user.findUnique({ where: key, select: { id: true } })) ??
        (await tx.user.create({ data: { name: input.name, ...key }, select: { id: true } }));
      await tx.groupMember.create({
        data: {
          groupId: input.groupId,
          userId: user.id,
          isPaying: input.isPaying,
          ...(input.startsOn ? { startsOn: input.startsOn } : {}),
          ...split,
        },
      });
    });
  },
);

/** One UPDATE on group_members by PK. */
export const updateMember = formAction(
  z.object({ ...memberFields, userId: f.id, role: z.enum(["admin", "member"]).optional() }),
  async (input) => {
    const { currency } = await actionMember(input.groupId, { admin: true });
    const target = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
      select: { role: true },
    });
    if (!target) throw new ActionError("not_member");
    await prisma.groupMember.update({
      where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
      data: {
        isPaying: input.isPaying,
        ...(input.startsOn ? { startsOn: input.startsOn } : {}),
        ...(target.role !== "owner" && input.role ? { role: input.role } : {}),
        ...toSplitColumns(input.splitMethod, input.splitValue, currency),
      },
    });
  },
);

/** DELETE by PK. Fails with in_use when the member has payments (FK restrict keeps history intact). */
export const removeMember = formAction(z.object({ groupId: f.id, userId: f.id }), async ({ groupId, userId }) => {
  const { user } = await actionMember(groupId, { admin: true });
  if (userId === user.id) throw new ActionError("cannot_remove_self");
  const { count } = await prisma.groupMember.deleteMany({ where: { groupId, userId, role: { not: "owner" } } });
  if (!count) throw new ActionError("cannot_remove_owner");
});
