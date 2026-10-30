"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { actionMember, ActionError } from "@/server/guard";
import { f, formAction, toMinorOrThrow, withUpload } from "@/server/action";
import { approvalFor } from "@/server/approval";
import { removeFiles } from "@/server/storage";

/**
 * Optional receipt upload, then one INSERT into payments. Composite FKs guarantee payer, payee and
 * activity belong to the group; a CHECK rejects paying yourself. Members can only record payments they made,
 * and those wait in the admin queue before they count.
 */
export const addPayment = formAction(
  z.object({
    groupId: f.id,
    payerId: f.id,
    payeeId: f.optionalId,
    activityId: f.optionalId,
    amount: f.money,
    paidOn: f.date,
    note: f.optionalText(200),
    receipt: f.file,
  }),
  async (input) => {
    const { user, admin, currency } = await actionMember(input.groupId);
    if (!admin && input.payerId !== user.id) throw new ActionError("not_allowed");
    if (input.payeeId === input.payerId) throw new ActionError("invalid_payee");
    const amount = toMinorOrThrow(input.amount, currency);
    await withUpload(input.receipt, `groups/${input.groupId}/receipts`, (receiptPath) =>
      prisma.payment.create({
        data: {
          groupId: input.groupId,
          payerId: input.payerId,
          payeeId: input.payeeId ?? null,
          activityId: input.activityId ?? null,
          amount,
          note: input.note ?? null,
          receiptPath,
          createdById: user.id,
          ...approvalFor(admin, user.id),
          ...(input.paidOn ? { paidOn: input.paidOn } : {}),
        },
      }),
    );
  },
);

/** Delete or reject. Admins: any payment. Members: only their own pending ones. Then removes the receipt. */
export const deletePayment = formAction(z.object({ groupId: f.id, paymentId: f.id }), async ({ groupId, paymentId }) => {
  const { user, admin } = await actionMember(groupId);
  const rows = await prisma.$queryRaw<{ receiptPath: string | null }[]>`
    DELETE FROM payments
    WHERE id = ${paymentId}::uuid AND group_id = ${groupId}::uuid ${admin ? Prisma.empty : Prisma.sql`AND created_by_id = ${user.id}::uuid AND approved_at IS NULL`}
    RETURNING receipt_path AS "receiptPath"`;
  if (!rows.length) throw new ActionError("not_allowed");
  await removeFiles([rows[0].receiptPath]);
});
