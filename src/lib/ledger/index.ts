export type SplitMethod = "equal" | "shares" | "percentage" | "amount";

export type MemberWeights = {
  userId: string;
  isPayingUser: boolean;
  share: number;
  percentage: number | null;
  amount: number | null;
};

export type ShareSpec = {
  userId: string;
  included: boolean;
  shareWeight: number;
  percentage: number | null;
  amountOverride: number | null;
};

export type SplitLine = {
  userId: string;
  dueAmount: number;
  baselineAmount: number;
};

function weightForMethod(
  method: SplitMethod,
  m: {
    share: number;
    percentage: number | null;
    amount: number | null;
    shareWeight?: number;
    amountOverride?: number | null;
  },
): number {
  switch (method) {
    case "equal":
      return 1;
    case "shares":
      return m.shareWeight ?? m.share ?? 0;
    case "percentage":
      return Number(m.percentage ?? 0);
    case "amount":
      return m.amountOverride ?? m.amount ?? 0;
    default:
      return 1;
  }
}

/**
 * Distribute `amount` so the parts sum exactly to `amount`.
 * Remainders (+1) go to larger fractional parts; ties: paying users first, then userId.
 */
export function distributeExact(
  amount: number,
  parts: { userId: string; weight: number; isPayingUser?: boolean }[],
): Record<string, number> {
  const result: Record<string, number> = {};
  const eligible = parts.filter((p) => p.weight > 0);
  if (amount === 0 || eligible.length === 0) {
    for (const p of parts) result[p.userId] = 0;
    return result;
  }
  const totalWeight = eligible.reduce((s, p) => s + p.weight, 0);
  if (totalWeight <= 0) {
    for (const p of parts) result[p.userId] = 0;
    return result;
  }

  const rows = eligible.map((p) => {
    const exact = (amount * p.weight) / totalWeight;
    const floored = Math.floor(exact);
    return {
      userId: p.userId,
      isPayingUser: Boolean(p.isPayingUser),
      floored,
      frac: exact - floored,
    };
  });

  let remainder = amount - rows.reduce((s, r) => s + r.floored, 0);
  rows.sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    if (a.isPayingUser !== b.isPayingUser) return a.isPayingUser ? -1 : 1;
    return a.userId.localeCompare(b.userId);
  });
  for (const r of rows) {
    result[r.userId] = r.floored;
  }
  let i = 0;
  while (remainder > 0 && rows.length > 0) {
    result[rows[i % rows.length].userId] += 1;
    remainder -= 1;
    i += 1;
  }
  for (const p of parts) {
    if (result[p.userId] === undefined) result[p.userId] = 0;
  }
  return result;
}

export function computeExpenseSplits(input: {
  amount: number;
  dueMethod: SplitMethod;
  baselineMethod: SplitMethod;
  members: MemberWeights[];
  shares: ShareSpec[];
  budgetPaidAmount?: number;
}): SplitLine[] {
  const included = input.shares.filter((s) => s.included);
  const memberById = new Map(input.members.map((m) => [m.userId, m]));

  const dueParts = included.map((s) => {
    const m = memberById.get(s.userId);
    const weight = weightForMethod(input.dueMethod, {
      share: m?.share ?? s.shareWeight,
      percentage: s.percentage ?? m?.percentage ?? null,
      amount: s.amountOverride ?? m?.amount ?? null,
      shareWeight: s.shareWeight,
      amountOverride: s.amountOverride,
    });
    return {
      userId: s.userId,
      weight,
      isPayingUser: Boolean(m?.isPayingUser),
    };
  });

  const dues = distributeExact(input.amount, dueParts);

  const paying = input.members.filter((m) => m.isPayingUser);
  const poolWeight = paying.reduce((s, m) => {
    return s + weightForMethod(input.baselineMethod, m);
  }, 0);

  return included.map((s) => {
    const m = memberById.get(s.userId);
    const myWeight = weightForMethod(input.baselineMethod, {
      share: m?.share ?? 1,
      percentage: m?.percentage ?? null,
      amount: m?.amount ?? null,
    });
    let baselineAmount = 0;
    const cap = baselineCap(input.amount, input.budgetPaidAmount ?? 0);
    if (poolWeight > 0) {
      baselineAmount = Math.round((cap * myWeight) / poolWeight);
    }
    return {
      userId: s.userId,
      dueAmount: dues[s.userId] ?? 0,
      baselineAmount,
    };
  });
}

export type BalanceSlice = {
  userId: string;
  due: number;
  paid: number;
  net: number;
};

export function netsFrom(dues: Record<string, number>, paids: Record<string, number>): BalanceSlice[] {
  const ids = new Set([...Object.keys(dues), ...Object.keys(paids)]);
  return [...ids].sort().map((userId) => {
    const due = dues[userId] ?? 0;
    const paid = paids[userId] ?? 0;
    return { userId, due, paid, net: paid - due };
  });
}

/** A member is only in dues/paid history from invitedAt onward. */
export function wasMemberAt(invitedAt: Date, at: Date): boolean {
  return invitedAt.getTime() <= at.getTime();
}

/**
 * Who should be asked to fund remaining R of an unfunded expense,
 * after current nets (including this expense's dues) are applied.
 */
export function collectionDemand(input: {
  remaining: number;
  nets: { userId: string; net: number; isPayingUser?: boolean }[];
}): Record<string, number> {
  if (input.remaining <= 0) return {};
  const debtors = input.nets.filter((n) => n.net < 0);
  if (debtors.length === 0) {
    const all = input.nets.filter((n) => n.net <= 0);
    const parts = (all.length ? all : input.nets).map((n) => ({
      userId: n.userId,
      weight: 1,
      isPayingUser: n.isPayingUser,
    }));
    return distributeExact(input.remaining, parts);
  }
  return distributeExact(
    input.remaining,
    debtors.map((d) => ({
      userId: d.userId,
      weight: 1,
      isPayingUser: d.isPayingUser,
    })),
  );
}

export function paySuggestion(input: {
  expenseUnpaid: boolean;
  baselineAmount: number;
  demandAmount: number;
}): number {
  if (input.expenseUnpaid && input.baselineAmount > 0) {
    return input.baselineAmount;
  }
  return input.demandAmount;
}

export function collectionStatus(
  amount: number,
  collected: number,
): "uncollected" | "partial" | "collected" {
  if (collected <= 0) return "uncollected";
  if (collected >= amount) return "collected";
  return "partial";
}

/** Shown baseline is 0 once the expense is fully collected. Stored share amounts stay historical. */
export function displayedBaseline(
  baselineAmount: number,
  collected: number,
  amount: number,
): number {
  if (collected >= amount) return 0;
  return baselineAmount;
}

/** Unallocated remainder of a payment or uncollected remainder of an expense. */
export function leftover(amount: number, used: number): number {
  return Math.max(0, amount - used);
}

export function baselineCap(expenseAmount: number, budgetPaidAmount: number): number {
  return leftover(expenseAmount, budgetPaidAmount);
}

export function allocationTake(paymentLeftover: number, expenseLeftover: number): number {
  return Math.min(Math.max(0, paymentLeftover), Math.max(0, expenseLeftover));
}

/** FIFO: consume payment leftovers against an expense leftover. */
export function consumePaymentSurplus(input: {
  expenseLeftover: number;
  payments: { paymentId: string; leftover: number }[];
}): { paymentId: string; amount: number }[] {
  let remaining = Math.max(0, input.expenseLeftover);
  if (remaining <= 0) return [];
  const out: { paymentId: string; amount: number }[] = [];
  for (const p of input.payments) {
    if (remaining <= 0) break;
    const take = allocationTake(p.leftover, remaining);
    if (take <= 0) continue;
    out.push({ paymentId: p.paymentId, amount: take });
    remaining -= take;
  }
  return out;
}

/** Merchant Pay: each row is a new payment; only leftover expense is allocated. */
export function planMerchantFunding(
  expenseAmount: number,
  payers: { userId: string; amount: number }[],
): { userId: string; paymentAmount: number; allocated: number }[] {
  const merged = new Map<string, number>();
  for (const p of payers) {
    if (p.amount > 0) merged.set(p.userId, (merged.get(p.userId) ?? 0) + p.amount);
  }
  let expenseLeft = Math.max(0, expenseAmount);
  return [...merged.entries()].map(([userId, paymentAmount]) => {
    const allocated = allocationTake(paymentAmount, expenseLeft);
    expenseLeft -= allocated;
    return { userId, paymentAmount, allocated };
  });
}

export function remainingDueOnExpense(dueAmount: number, allocatedFromUser: number): number {
  return leftover(dueAmount, allocatedFromUser);
}

/** Original split vs remaining IOU after this member’s approved allocations. */
export function memberDueTotals(input: {
  members: { userId: string; invitedAt: Date }[];
  expenses: {
    createdAt: Date;
    shares: { userId: string; included: boolean; dueAmount: number }[];
    allocations: { amount: number; payerUserId?: string }[];
  }[];
}): { originalDue: Record<string, number>; remainingDue: Record<string, number> } {
  const originalDue: Record<string, number> = {};
  const remainingDue: Record<string, number> = {};
  const invitedAt = new Map(input.members.map((m) => [m.userId, m.invitedAt]));
  for (const m of input.members) {
    originalDue[m.userId] = 0;
    remainingDue[m.userId] = 0;
  }
  for (const e of input.expenses) {
    for (const s of e.shares) {
      if (!s.included) continue;
      const joined = invitedAt.get(s.userId);
      if (!joined || !wasMemberAt(joined, e.createdAt)) continue;
      originalDue[s.userId] = (originalDue[s.userId] ?? 0) + s.dueAmount;
      remainingDue[s.userId] =
        (remainingDue[s.userId] ?? 0) +
        remainingDueOnExpense(s.dueAmount, allocatedFromUser(e.allocations, s.userId));
    }
  }
  return { originalDue, remainingDue };
}

export function allocatedFromUser(
  allocations: { amount: number; payerUserId?: string }[],
  userId: string,
): number {
  return allocations
    .filter((a) => a.payerUserId === userId)
    .reduce((s, a) => s + a.amount, 0);
}

export function expenseCollected(input: { allocations: { amount: number }[] }): number {
  return input.allocations.reduce((s, a) => s + a.amount, 0);
}

export function collectedOf(e: { allocations: { amount: number }[] }): number {
  return expenseCollected({ allocations: e.allocations });
}

/** Displayed group budget: approved payments minus approved expenses. */
export function groupBudgetSurplus(input: { payments: number; expenses: number }): number {
  return input.payments - input.expenses;
}

/** Spendable pay-from-budget pool: leftover unallocated approved payments. */
export function unallocatedPaymentSurplus(input: { payments: number; allocated: number }): number {
  return leftover(input.payments, input.allocated);
}
