export type Contributor = {
  key: string;
  name: string;
  amount: number;
  kind: "payer" | "payment" | "budget";
};

type ExpenseForContributors = {
  approvalStatus?: string;
  payers: { userId: string; amount: number; paymentId?: string | null; user?: { name: string } | null }[];
  allocations: {
    amount: number;
    payment?: {
      payerUserId: string;
      payer?: { name: string } | null;
    } | null;
  }[];
};

function addTo(
  byKey: Map<string, Contributor>,
  key: string,
  name: string,
  amount: number,
  kind: Contributor["kind"],
) {
  if (amount <= 0) return;
  const prev = byKey.get(key);
  if (prev) {
    prev.amount += amount;
    return;
  }
  byKey.set(key, { key, name, amount, kind });
}

export function contributorsForExpenses(expenses: ExpenseForContributors[]): Contributor[] {
  const byKey = new Map<string, Contributor>();

  for (const e of expenses) {
    if (e.approvalStatus && e.approvalStatus !== "approved") continue;
    for (const p of e.payers) {
      if ("paymentId" in p && p.paymentId) continue;
      addTo(byKey, `payer:${p.userId}`, p.user?.name ?? p.userId, p.amount, "payer");
    }
    for (const a of e.allocations) {
      const payment = a.payment;
      if (!payment) continue;
      addTo(
        byKey,
        `pay:${payment.payerUserId}`,
        payment.payer?.name ?? payment.payerUserId,
        a.amount,
        "payment",
      );
    }
  }

  return [...byKey.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

export function contributorsForPayments(
  payments: {
    approvalStatus?: string;
    amount: number;
    payerUserId: string;
    payer?: { name: string } | null;
  }[],
): Contributor[] {
  const byKey = new Map<string, Contributor>();
  for (const p of payments) {
    if (p.approvalStatus && p.approvalStatus !== "approved") continue;
    addTo(byKey, `pay:${p.payerUserId}`, p.payer?.name ?? p.payerUserId, p.amount, "payment");
  }
  return [...byKey.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
