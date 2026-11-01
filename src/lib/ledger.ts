/**
 * Pure ledger math. All money is integer minor units (halalas, cents).
 * No I/O here: callers pass rows they already loaded.
 */

export type SplitMethod = "amount" | "shares" | "percentage";
export type SplitRule = { method: SplitMethod; value: number } | null;

export type LedgerMember = {
  userId: string;
  isPaying: boolean;
  startsOn: Date;
  rule: SplitRule;
};

/** closed: dues were frozen into activity_members when it was closed, so only those rows count. */
export type LedgerActivity = { id: string; startsOn: Date; total: number; closed?: boolean };

/** A row in activity_members: lists the member on the activity and may override the rule. */
export type ActivityEntry = { activityId: string; userId: string; rule: SplitRule };

export type ActivityDues = {
  total: number;
  /** userId -> due for this activity. Every participant has a key. */
  dues: Record<string, number>;
  /** Participants with no rule on the member or the activity: due must be set. */
  unset: string[];
  /** total - Σ dues. Positive: nobody covers it yet. Negative: rules exceed the total. */
  unassigned: number;
};

export type MemberBalance = { due: number; paid: number; balance: number };

/**
 * Split `amount` by weight so the parts sum to exactly `amount`.
 * Leftover units go to the largest fractional parts; ties break by userId.
 */
export function distributeExact(
  amount: number,
  parts: { userId: string; weight: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of parts) out[p.userId] = 0;
  const live = parts.filter((p) => p.weight > 0);
  const totalWeight = live.reduce((s, p) => s + p.weight, 0);
  if (amount <= 0 || totalWeight <= 0) return out;

  const rows = live.map((p) => {
    const exact = (amount * p.weight) / totalWeight;
    const floor = Math.floor(exact);
    return { userId: p.userId, floor, frac: exact - floor };
  });
  let left = amount - rows.reduce((s, r) => s + r.floor, 0);
  rows.sort((a, b) => b.frac - a.frac || a.userId.localeCompare(b.userId));
  for (const r of rows) out[r.userId] = r.floor;
  for (let i = 0; left > 0; i = (i + 1) % rows.length, left--) out[rows[i].userId] += 1;
  return out;
}

/**
 * Fixed amounts first, then percentages of the total, then shares split what is left.
 * Members with no rule owe 0 here and are reported in `unset`.
 */
export function splitActivity(
  total: number,
  participants: { userId: string; rule: SplitRule }[],
): ActivityDues {
  const dues: Record<string, number> = {};
  const unset: string[] = [];
  const pct: { userId: string; weight: number }[] = [];
  const shares: { userId: string; weight: number }[] = [];
  let fixed = 0;

  for (const p of participants) {
    dues[p.userId] = 0;
    if (!p.rule) unset.push(p.userId);
    else if (p.rule.method === "amount") {
      dues[p.userId] = Math.round(p.rule.value);
      fixed += dues[p.userId];
    } else if (p.rule.method === "percentage") pct.push({ userId: p.userId, weight: p.rule.value });
    else shares.push({ userId: p.userId, weight: p.rule.value });
  }

  const pctSum = pct.reduce((s, p) => s + p.weight, 0);
  const pctTotal = Math.round((total * Math.min(pctSum, 100)) / 100);
  Object.assign(dues, distributeExact(pctTotal, pct));

  const rest = total - fixed - pctTotal;
  if (rest > 0 && shares.length) Object.assign(dues, distributeExact(rest, shares));

  const assigned = Object.values(dues).reduce((s, v) => s + v, 0);
  return { total, dues, unset, unassigned: total - assigned };
}

/**
 * Dues to freeze when an activity closes. If the dues add up to more than the expenses, every due is
 * scaled down by the same ratio so they sum exactly to the expenses. If they add up to less, they are kept
 * and the unshared part stays uncovered.
 */
export function closingDues(split: ActivityDues): Record<string, number> {
  const assigned = split.total - split.unassigned;
  if (assigned <= split.total) return { ...split.dues };
  return distributeExact(
    split.total,
    Object.entries(split.dues).map(([userId, due]) => ({ userId, weight: due })),
  );
}

/** Closing is allowed once this activity's tagged payments (to the group or to a member) plus its fills cover its expenses. */
export const paymentsCover = (total: number, payments: { amount: number }[], filled = 0) =>
  payments.reduce((sum, p) => sum + p.amount, 0) + filled >= total;

export type FillRow = { activityId: string; userId: string; amount: number; total: number; tagged: number };

/**
 * How much of each fill still counts: only the part of the shortfall (expenses - tagged payments) that
 * payments haven't covered since. If fills exceed what's still needed, each is reduced by the same ratio,
 * and the rest is free surplus again. Returns activityId -> userId -> effective amount.
 */
export function effectiveFills(rows: FillRow[]): Record<string, Record<string, number>> {
  const byActivity = new Map<string, FillRow[]>();
  for (const r of rows) byActivity.set(r.activityId, [...(byActivity.get(r.activityId) ?? []), r]);
  const out: Record<string, Record<string, number>> = {};
  for (const [activityId, fills] of byActivity) {
    const need = Math.max(0, fills[0].total - fills[0].tagged);
    const sum = fills.reduce((s, f) => s + f.amount, 0);
    out[activityId] =
      sum <= need
        ? Object.fromEntries(fills.map((f) => [f.userId, f.amount]))
        : distributeExact(need, fills.map((f) => ({ userId: f.userId, weight: f.amount })));
  }
  return out;
}

/** Surplus a member can still lend through fills: positive balance minus what their fills already cover. */
export function availableSurplus(
  byUser: Record<string, MemberBalance>,
  effective: Record<string, Record<string, number>>,
): Record<string, number> {
  const used: Record<string, number> = {};
  for (const fills of Object.values(effective)) for (const [u, v] of Object.entries(fills)) used[u] = (used[u] ?? 0) + v;
  return Object.fromEntries(
    Object.entries(byUser)
      .map(([u, b]) => [u, Math.max(0, b.balance - (used[u] ?? 0))] as const)
      .filter(([, v]) => v > 0),
  );
}

/** The fill to add now: the shortfall (capped by surplus), split by each member's available surplus. */
export function planFill(shortfall: number, available: Record<string, number>): Record<string, number> {
  const pool = Object.values(available).reduce((s, v) => s + v, 0);
  const take = Math.min(Math.max(0, shortfall), pool);
  if (take === 0) return {};
  const parts = distributeExact(
    take,
    Object.entries(available).map(([userId, weight]) => ({ userId, weight })),
  );
  return Object.fromEntries(Object.entries(parts).filter(([, v]) => v > 0));
}

export type ActivityRow = { userId: string; due: number; paid: number; fromSurplus: number; left: number };

/**
 * Report for one activity: a row per participant, payer or filler. `paid` = tagged payments plus the part of
 * this activity their surplus covers (`fromSurplus`). `left` = due - paid, negative when someone paid extra.
 */
export function activitySummary(
  split: ActivityDues,
  covered: ReturnType<typeof activityPaid>,
  fills: Record<string, number> = {},
) {
  const ids = new Set([
    ...Object.keys(split.dues),
    ...Object.keys(covered.paid).filter((id) => covered.paid[id] !== 0),
    ...Object.keys(fills).filter((id) => fills[id] > 0),
  ]);
  const rows: ActivityRow[] = [...ids].map((userId) => {
    const due = split.dues[userId] ?? 0;
    const fromSurplus = fills[userId] ?? 0;
    const paid = (covered.paid[userId] ?? 0) + fromSurplus;
    return { userId, due, paid, fromSurplus, left: due - paid };
  });
  const outstanding = rows.reduce((s, r) => s + Math.max(r.left, 0), 0);
  const extra = rows.reduce((s, r) => s + Math.max(-r.left, 0), 0);
  const filled = Object.values(fills).reduce((s, v) => s + v, 0);
  return { rows, outstanding, extra, collected: covered.intoGroup, filled };
}

/**
 * Who paid for one activity: only approved payments tagged with it count.
 * A tagged payment to a member moves that amount from the payee to the payer.
 * Untagged payments are general credit and only show in the overall balance.
 */
export function activityPaid(payments: { payerId: string; payeeId: string | null; amount: number }[]) {
  const paid: Record<string, number> = {};
  let intoGroup = 0;
  for (const p of payments) {
    paid[p.payerId] = (paid[p.payerId] ?? 0) + p.amount;
    if (p.payeeId) paid[p.payeeId] = (paid[p.payeeId] ?? 0) - p.amount;
    else intoGroup += p.amount;
  }
  return { paid, intoGroup };
}

/** Paying members from their start date, plus anyone listed on the activity. Closed: only the listed (frozen) rows. */
export function activityParticipants(
  activity: LedgerActivity,
  members: LedgerMember[],
  entries: ActivityEntry[],
): { userId: string; rule: SplitRule }[] {
  const listed = new Map(entries.filter((e) => e.activityId === activity.id).map((e) => [e.userId, e]));
  return members
    .filter((m) => listed.has(m.userId) || (!activity.closed && m.isPaying && m.startsOn.getTime() <= activity.startsOn.getTime()))
    .map((m) => ({ userId: m.userId, rule: listed.get(m.userId)?.rule ?? m.rule }));
}

/**
 * Paid = what the member paid minus what other members paid to them.
 * Balance = paid - due across every activity. Positive balance is credit that covers later dues.
 */
export function groupLedger(input: {
  members: LedgerMember[];
  activities: LedgerActivity[];
  entries: ActivityEntry[];
  payments: { userId: string; paidOut: number; received: number }[];
}) {
  const byUser: Record<string, MemberBalance> = {};
  for (const m of input.members) byUser[m.userId] = { due: 0, paid: 0, balance: 0 };

  const byActivity: Record<string, ActivityDues> = {};
  for (const a of input.activities) {
    const split = splitActivity(a.total, activityParticipants(a, input.members, input.entries));
    byActivity[a.id] = split;
    for (const [userId, due] of Object.entries(split.dues)) byUser[userId].due += due;
  }

  let paidIn = 0;
  for (const p of input.payments) {
    if (byUser[p.userId]) byUser[p.userId].paid += p.paidOut - p.received;
    paidIn += p.paidOut - p.received;
  }
  for (const b of Object.values(byUser)) b.balance = b.paid - b.due;

  const spent = input.activities.reduce((s, a) => s + a.total, 0);
  return { byUser, byActivity, cash: paidIn - spent };
}
