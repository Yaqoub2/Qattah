"use server";

import { z } from "zod";
import { prisma } from "@/server/db";
import { actionMember, ActionError } from "@/server/guard";
import { f, formAction } from "@/server/action";

/** Admin approves a pending expense or payment: one conditional UPDATE, so approving twice is a no-op error. */
export const approveEntry = formAction(
  z.object({ groupId: f.id, id: f.id, kind: z.enum(["expense", "payment"]) }),
  async ({ groupId, id, kind }) => {
    const { user } = await actionMember(groupId, { admin: true });
    const where = { id, groupId, approvedAt: null };
    const data = { approvedAt: new Date(), approvedById: user.id };
    const { count } =
      kind === "expense"
        ? await prisma.expense.updateMany({ where, data })
        : await prisma.payment.updateMany({ where, data });
    if (!count) throw new ActionError("already_handled");
  },
);
