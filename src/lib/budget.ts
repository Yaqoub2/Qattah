import { prisma } from "./db";
import type { Prisma, PrismaClient } from "@prisma/client";

export type BudgetKind = "deposit" | "expense" | "payment";

type Db = PrismaClient | Prisma.TransactionClient;

export async function applyBudgetDelta(
  opts: {
    groupId: string;
    amount: number;
    kind: BudgetKind;
    actorUserId: string;
    expenseId?: string;
    paymentId?: string;
    note?: string | null;
  },
  db: Db = prisma,
): Promise<{ ok: true }> {
  if (opts.amount === 0) return { ok: true };

  await db.groupBudgetEvent.create({
    data: {
      groupId: opts.groupId,
      amount: opts.amount,
      kind: opts.kind,
      actorUserId: opts.actorUserId,
      expenseId: opts.expenseId,
      paymentId: opts.paymentId,
      note: opts.note ?? null,
    },
  });
  return { ok: true };
}
