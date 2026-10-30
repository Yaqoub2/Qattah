import { describe, expect, it } from "vitest";
import {
  allocatedFromUser,
  allocationTake,
  baselineCap,
  collectionDemand,
  computeExpenseSplits,
  consumePaymentSurplus,
  displayedBaseline,
  expenseCollected,
  groupBudgetSurplus,
  leftover,
  unallocatedPaymentSurplus,
  netsFrom,
  paySuggestion,
  planMerchantFunding,
  remainingDueOnExpense,
  memberDueTotals,
  wasMemberAt,
} from "./index";

function ids(n: number, prefix = "u") {
  return Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);
}

describe("dual ledger", () => {
  it("10 members / 5 paying / 1000 equal → baseline 200 for all, due 100", () => {
    const userIds = ids(10);
    const members = userIds.map((userId, i) => ({
      userId,
      isPayingUser: i < 5,
      share: 1,
      percentage: null,
      amount: null,
    }));
    const shares = userIds.map((userId) => ({
      userId,
      included: true,
      shareWeight: 1,
      percentage: null,
      amountOverride: null,
    }));
    const lines = computeExpenseSplits({
      amount: 100_000,
      dueMethod: "equal",
      baselineMethod: "equal",
      members,
      shares,
    });
    expect(lines).toHaveLength(10);
    for (const line of lines) {
      expect(line.dueAmount).toBe(10_000);
      expect(line.baselineAmount).toBe(20_000);
    }
    expect(lines.reduce((s, l) => s + l.dueAmount, 0)).toBe(100_000);
  });

  it("non-paying user Pay on unpaid expense sees baseline 200", () => {
    const suggestion = paySuggestion({
      expenseUnpaid: true,
      baselineAmount: 20_000,
      demandAmount: 10_000,
    });
    expect(suggestion).toBe(20_000);
  });

  it("after five paying users each pay 200, nets are +100 / -100", () => {
    const userIds = ids(10);
    const dues: Record<string, number> = {};
    const paids: Record<string, number> = {};
    for (const id of userIds) dues[id] = 10_000;
    for (let i = 0; i < 5; i++) paids[userIds[i]] = 20_000;
    const nets = netsFrom(dues, paids);
    for (let i = 0; i < 5; i++) {
      expect(nets.find((n) => n.userId === userIds[i])?.net).toBe(10_000);
    }
    for (let i = 5; i < 10; i++) {
      expect(nets.find((n) => n.userId === userIds[i])?.net).toBe(-10_000);
    }
  });

  it("next 500 → collectors not asked; five debtors asked 100 each", () => {
    const userIds = ids(10);
    const dues1: Record<string, number> = {};
    const paids: Record<string, number> = {};
    for (const id of userIds) dues1[id] = 10_000;
    for (let i = 0; i < 5; i++) paids[userIds[i]] = 20_000;

    const members = userIds.map((userId, i) => ({
      userId,
      isPayingUser: i < 5,
      share: 1,
      percentage: null,
      amount: null,
    }));
    const shares = userIds.map((userId) => ({
      userId,
      included: true,
      shareWeight: 1,
      percentage: null,
      amountOverride: null,
    }));
    const expense2 = computeExpenseSplits({
      amount: 50_000,
      dueMethod: "equal",
      baselineMethod: "equal",
      members,
      shares,
    });
    for (const line of expense2) {
      expect(line.dueAmount).toBe(5_000);
      expect(line.baselineAmount).toBe(10_000);
    }

    const dues: Record<string, number> = {};
    for (const id of userIds) {
      dues[id] = (dues1[id] ?? 0) + 5_000;
    }
    const nets = netsFrom(dues, paids);
    for (let i = 0; i < 5; i++) {
      expect(nets.find((n) => n.userId === userIds[i])?.net).toBe(5_000);
    }
    for (let i = 5; i < 10; i++) {
      expect(nets.find((n) => n.userId === userIds[i])?.net).toBe(-15_000);
    }

    const demand = collectionDemand({
      remaining: 50_000,
      nets: nets.map((n, i) => ({
        userId: n.userId,
        net: n.net,
        isPayingUser: i < 5,
      })),
    });
    for (let i = 0; i < 5; i++) {
      expect(demand[userIds[i]] ?? 0).toBe(0);
    }
    for (let i = 5; i < 10; i++) {
      expect(demand[userIds[i]]).toBe(10_000);
    }
  });

  it("same share ⇒ same baseline whether paying or not", () => {
    const members = [
      { userId: "a", isPayingUser: true, share: 2, percentage: null, amount: null },
      { userId: "b", isPayingUser: true, share: 1, percentage: null, amount: null },
      { userId: "c", isPayingUser: false, share: 2, percentage: null, amount: null },
      { userId: "d", isPayingUser: false, share: 1, percentage: null, amount: null },
    ];
    const shares = members.map((m) => ({
      userId: m.userId,
      included: true,
      shareWeight: m.share,
      percentage: null,
      amountOverride: null,
    }));
    const lines = computeExpenseSplits({
      amount: 300,
      dueMethod: "shares",
      baselineMethod: "shares",
      members,
      shares,
    });
    const byId = Object.fromEntries(lines.map((l) => [l.userId, l]));
    expect(byId.a.baselineAmount).toBe(byId.c.baselineAmount);
    expect(byId.b.baselineAmount).toBe(byId.d.baselineAmount);
    expect(byId.a.baselineAmount).toBe(200);
    expect(byId.b.baselineAmount).toBe(100);
  });

  it("percentage: same % ⇒ same baseline", () => {
    const members = [
      { userId: "p1", isPayingUser: true, share: 1, percentage: 50, amount: null },
      { userId: "p2", isPayingUser: true, share: 1, percentage: 50, amount: null },
      { userId: "n1", isPayingUser: false, share: 1, percentage: 50, amount: null },
    ];
    const shares = members.map((m) => ({
      userId: m.userId,
      included: true,
      shareWeight: 1,
      percentage: m.percentage,
      amountOverride: null,
    }));
    const lines = computeExpenseSplits({
      amount: 1000,
      dueMethod: "percentage",
      baselineMethod: "percentage",
      members,
      shares,
    });
    const byId = Object.fromEntries(lines.map((l) => [l.userId, l]));
    expect(byId.p1.baselineAmount).toBe(500);
    expect(byId.n1.baselineAmount).toBe(500);
  });

  it("due sums to amount with remainder going to paying users first", () => {
    const members = [
      { userId: "z", isPayingUser: false, share: 1, percentage: null, amount: null },
      { userId: "a", isPayingUser: true, share: 1, percentage: null, amount: null },
      { userId: "b", isPayingUser: true, share: 1, percentage: null, amount: null },
    ];
    const shares = members.map((m) => ({
      userId: m.userId,
      included: true,
      shareWeight: 1,
      percentage: null,
      amountOverride: null,
    }));
    const lines = computeExpenseSplits({
      amount: 100,
      dueMethod: "equal",
      baselineMethod: "equal",
      members,
      shares,
    });
    expect(lines.reduce((s, l) => s + l.dueAmount, 0)).toBe(100);
  });

  it("displayed baseline is 0 once the expense is fully collected", () => {
    expect(displayedBaseline(20_000, 100_000, 100_000)).toBe(0);
    expect(displayedBaseline(20_000, 50_000, 100_000)).toBe(20_000);
    expect(
      paySuggestion({
        expenseUnpaid: false,
        baselineAmount: displayedBaseline(20_000, 100_000, 100_000),
        demandAmount: 0,
      }),
    ).toBe(0);
  });

  it("group budget is approved payments minus approved expenses", () => {
    expect(groupBudgetSurplus({ payments: 0, expenses: 0 })).toBe(0);
    expect(groupBudgetSurplus({ payments: 100_000, expenses: 100_000 })).toBe(0);
    expect(groupBudgetSurplus({ payments: 120_000, expenses: 100_000 })).toBe(20_000);
    expect(groupBudgetSurplus({ payments: 50_000, expenses: 0 })).toBe(50_000);
    expect(groupBudgetSurplus({ payments: 100_000, expenses: 120_000 })).toBe(-20_000);
    const nets = netsFrom({ a: 10_000, b: 10_000 }, { a: 10_000 });
    expect(nets.find((n) => n.userId === "a")?.net).toBe(0);
    expect(nets.find((n) => n.userId === "b")?.net).toBe(-10_000);
    expect(
      expenseCollected({
        allocations: [{ amount: 10_000 }, { amount: 10_000 }],
      }),
    ).toBe(20_000);
  });

  it("member is only in dues after invitedAt", () => {
    const invited = new Date("2026-06-01T00:00:00Z");
    expect(wasMemberAt(invited, new Date("2026-05-01T00:00:00Z"))).toBe(false);
    expect(wasMemberAt(invited, new Date("2026-06-01T00:00:00Z"))).toBe(true);
    expect(wasMemberAt(invited, new Date("2026-06-02T00:00:00Z"))).toBe(true);
  });

  it("allocation consumes min(payment leftover, expense leftover) and keeps surplus", () => {
    expect(leftover(50_000, 0)).toBe(50_000);
    expect(allocationTake(50_000, 100_000)).toBe(50_000);
    expect(allocationTake(50_000, 40_000)).toBe(40_000);
    const draws = consumePaymentSurplus({
      expenseLeftover: 100_000,
      payments: [
        { paymentId: "p1", leftover: 30_000 },
        { paymentId: "p2", leftover: 20_000 },
        { paymentId: "p3", leftover: 80_000 },
      ],
    });
    expect(draws).toEqual([
      { paymentId: "p1", amount: 30_000 },
      { paymentId: "p2", amount: 20_000 },
      { paymentId: "p3", amount: 50_000 },
    ]);
    expect(leftover(80_000, 50_000)).toBe(30_000);
    expect(
      unallocatedPaymentSurplus({
        payments: 130_000,
        allocated: draws.reduce((s, d) => s + d.amount, 0),
      }),
    ).toBe(30_000);
  });

  it("merchant pay creates payments first; leftover expense is what gets allocated", () => {
    const planned = planMerchantFunding(100_000, [
      { userId: "u1", amount: 40_000 },
      { userId: "u2", amount: 150_000 },
    ]);
    expect(planned).toEqual([
      { userId: "u1", paymentAmount: 40_000, allocated: 40_000 },
      { userId: "u2", paymentAmount: 150_000, allocated: 60_000 },
    ]);
    expect(leftover(150_000, 60_000)).toBe(90_000);
  });

  it("remaining due on this expense falls to 0 when that user’s allocations cover their share", () => {
    expect(remainingDueOnExpense(20_000, 20_000)).toBe(0);
    expect(remainingDueOnExpense(20_000, 50_000)).toBe(0);
    expect(remainingDueOnExpense(20_000, 10_000)).toBe(10_000);
    expect(
      allocatedFromUser(
        [
          { amount: 10_000, payerUserId: "u1" },
          { amount: 5_000, payerUserId: "u2" },
          { amount: 10_000, payerUserId: "u1" },
        ],
        "u1",
      ),
    ).toBe(20_000);
  });

  it("member column due is remaining share, not original split", () => {
    const invited = new Date("2026-01-01T00:00:00Z");
    const later = new Date("2026-08-01T00:00:00Z");
    const dues = memberDueTotals({
      members: [
        { userId: "a", invitedAt: invited },
        { userId: "b", invitedAt: invited },
        { userId: "c", invitedAt: later },
      ],
      expenses: [
        {
          createdAt: new Date("2026-06-01T00:00:00Z"),
          shares: [
            { userId: "a", included: true, dueAmount: 50_000 },
            { userId: "b", included: true, dueAmount: 50_000 },
            { userId: "c", included: true, dueAmount: 50_000 },
          ],
          allocations: [
            { amount: 50_000, payerUserId: "a" },
            { amount: 20_000, payerUserId: "b" },
          ],
        },
      ],
    });
    expect(dues.originalDue).toEqual({ a: 50_000, b: 50_000, c: 0 });
    expect(dues.remainingDue).toEqual({ a: 0, b: 30_000, c: 0 });
  });

  it("baseline uses expense minus budget_paid_amount as the pool cap", () => {
    expect(baselineCap(100_000, 50_000)).toBe(50_000);
    const userIds = ["u1", "u2", "u3", "u4", "u5"];
    const members = userIds.map((userId) => ({
      userId,
      isPayingUser: true,
      share: 1,
      percentage: null,
      amount: null,
    }));
    const shares = userIds.map((userId) => ({
      userId,
      included: true,
      shareWeight: 1,
      percentage: null,
      amountOverride: null,
    }));
    const full = computeExpenseSplits({
      amount: 100_000,
      dueMethod: "equal",
      baselineMethod: "equal",
      members,
      shares,
    });
    expect(full.every((l) => l.dueAmount === 20_000 && l.baselineAmount === 20_000)).toBe(true);
    const capped = computeExpenseSplits({
      amount: 100_000,
      dueMethod: "equal",
      baselineMethod: "equal",
      members,
      shares,
      budgetPaidAmount: 50_000,
    });
    expect(capped.every((l) => l.dueAmount === 20_000 && l.baselineAmount === 10_000)).toBe(true);
  });
});
