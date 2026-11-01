import { describe, expect, it } from "vitest";
import { activityPaid, activityParticipants, activitySummary, availableSurplus, closingDues, effectiveFills, paymentsCover, planFill, distributeExact, groupLedger, splitActivity } from "./ledger";

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe("distributeExact", () => {
  it("sums to the amount and breaks ties by id", () => {
    const r = distributeExact(100, [
      { userId: "a", weight: 1 },
      { userId: "b", weight: 1 },
      { userId: "c", weight: 1 },
    ]);
    expect(r).toEqual({ a: 34, b: 33, c: 33 });
  });

  it("gives zero weight nothing", () => {
    expect(distributeExact(10, [{ userId: "a", weight: 0 }, { userId: "b", weight: 2 }])).toEqual({ a: 0, b: 10 });
  });
});

describe("splitActivity", () => {
  it("applies amount, then percentage, then shares", () => {
    const r = splitActivity(10_000, [
      { userId: "fixed", rule: { method: "amount", value: 2_000 } },
      { userId: "pct", rule: { method: "percentage", value: 25 } },
      { userId: "s1", rule: { method: "shares", value: 1 } },
      { userId: "s2", rule: { method: "shares", value: 2 } },
    ]);
    expect(r.dues).toEqual({ fixed: 2_000, pct: 2_500, s1: 1_833, s2: 3_667 });
    expect(r.unassigned).toBe(0);
    expect(sum(r.dues)).toBe(10_000);
  });

  it("reports members with no rule and leaves the rest unassigned", () => {
    const r = splitActivity(900, [
      { userId: "a", rule: { method: "amount", value: 300 } },
      { userId: "b", rule: null },
    ]);
    expect(r.unset).toEqual(["b"]);
    expect(r.dues.b).toBe(0);
    expect(r.unassigned).toBe(600);
  });

  it("flags rules that exceed the total", () => {
    const r = splitActivity(100, [
      { userId: "a", rule: { method: "amount", value: 80 } },
      { userId: "b", rule: { method: "amount", value: 80 } },
    ]);
    expect(r.unassigned).toBe(-60);
  });

  it("splits percentages exactly", () => {
    const third = { method: "percentage" as const, value: 100 / 3 };
    const r = splitActivity(100, [
      { userId: "a", rule: third },
      { userId: "b", rule: third },
      { userId: "c", rule: third },
    ]);
    expect(sum(r.dues)).toBe(100);
  });
});

describe("activityParticipants", () => {
  const shares = { method: "shares" as const, value: 1 };
  const members = [
    { userId: "early", isPaying: true, startsOn: day("2026-01-01"), rule: shares },
    { userId: "late", isPaying: true, startsOn: day("2026-06-01"), rule: shares },
    { userId: "guest", isPaying: false, startsOn: day("2026-01-01"), rule: shares },
    { userId: "listed", isPaying: false, startsOn: day("2026-01-01"), rule: shares },
  ];
  const activity = { id: "trip", startsOn: day("2026-03-01"), total: 0 };

  it("includes paying members from their start, and other members only when listed", () => {
    const p = activityParticipants(activity, members, [{ activityId: "trip", userId: "listed", rule: null }]);
    expect(p.map((x) => x.userId)).toEqual(["early", "listed"]);
  });

  it("uses the activity rule over the member rule", () => {
    const p = activityParticipants(activity, members, [
      { activityId: "trip", userId: "early", rule: { method: "amount", value: 500 } },
    ]);
    expect(p[0].rule).toEqual({ method: "amount", value: 500 });
  });
});

describe("activityPaid", () => {
  it("counts tagged payments and moves member-to-member payments to the payer", () => {
    const r = activityPaid([
      { payerId: "a", payeeId: null, amount: 1_000 },
      { payerId: "b", payeeId: "a", amount: 400 },
    ]);
    expect(r.paid).toEqual({ a: 600, b: 400 });
    expect(r.intoGroup).toBe(1_000);
  });
});

describe("groupLedger", () => {
  it("carries credit across activities and deducts payments received", () => {
    const shares = { method: "shares" as const, value: 1 };
    const members = [
      { userId: "a", isPaying: true, startsOn: day("2026-01-01"), rule: shares },
      { userId: "b", isPaying: true, startsOn: day("2026-01-01"), rule: shares },
    ];
    const ledger = groupLedger({
      members,
      activities: [
        { id: "x", startsOn: day("2026-02-01"), total: 1_000 },
        { id: "y", startsOn: day("2026-03-01"), total: 600 },
      ],
      entries: [],
      // a put 2000 into the group; b paid a back 300.
      payments: [
        { userId: "a", paidOut: 2_000, received: 300 },
        { userId: "b", paidOut: 300, received: 0 },
      ],
    });
    expect(ledger.byUser.a).toEqual({ due: 800, paid: 1_700, balance: 900 });
    expect(ledger.byUser.b).toEqual({ due: 800, paid: 300, balance: -500 });
    expect(ledger.cash).toBe(400);
  });
});

describe("activitySummary", () => {
  it("lists participants and payers with what is left or paid extra", () => {
    const split = { total: 300, dues: { a: 100, b: 200 }, unset: [], unassigned: 0 };
    const covered = activityPaid([
      { payerId: "a", payeeId: null, amount: 150 },
      { payerId: "c", payeeId: null, amount: 20 },
    ]);
    const r = activitySummary(split, covered);
    expect(r.rows).toEqual([
      { userId: "a", due: 100, paid: 150, fromSurplus: 0, left: -50 },
      { userId: "b", due: 200, paid: 0, fromSurplus: 0, left: 200 },
      { userId: "c", due: 0, paid: 20, fromSurplus: 0, left: -20 },
    ]);
    expect([r.outstanding, r.extra, r.collected]).toEqual([200, 70, 170]);
  });
});

describe("closed activity", () => {
  it("uses only the frozen activity_members rows, ignoring paying members' live rules", () => {
    const members = [
      { userId: "a", isPaying: true, startsOn: day("2026-01-01"), rule: { method: "shares" as const, value: 1 } },
      { userId: "b", isPaying: true, startsOn: day("2026-01-01"), rule: { method: "shares" as const, value: 1 } },
    ];
    const activity = { id: "x", startsOn: day("2026-02-01"), total: 300, closed: true };
    const entries = [{ activityId: "x", userId: "a", rule: { method: "amount" as const, value: 300 } }];
    expect(activityParticipants(activity, members, entries)).toEqual([{ userId: "a", rule: { method: "amount", value: 300 } }]);
    expect(activityParticipants({ ...activity, closed: false }, members, entries).map((p) => p.userId)).toEqual(["a", "b"]);
  });
});

describe("closingDues", () => {
  it("scales dues above the expenses down to exactly the expenses", () => {
    const dues = { a: 35000, b: 35000, c: 35000, d: 35000, e: 35000, f: 35000, g: 35000, h: 15000 };
    const r = closingDues({ total: 220800, dues, unset: [], unassigned: 220800 - 260000 });
    expect(sum(r)).toBe(220800);
    expect(r.a).toBe(29723);
    expect(r.h).toBe(12739);
  });
  it("keeps dues that add up to the expenses or less", () => {
    const split = { total: 300, dues: { a: 100, b: 100 }, unset: [], unassigned: 100 };
    expect(closingDues(split)).toEqual({ a: 100, b: 100 });
  });
  it("allows closing once tagged payments cover the expenses", () => {
    expect(paymentsCover(220800, [{ amount: 200000 }, { amount: 75000 }])).toBe(true);
    expect(paymentsCover(220800, [{ amount: 200000 }])).toBe(false);
  });
});

describe("fill from group budget", () => {
  const balances = {
    ali: { due: 0, paid: 300, balance: 300 },
    sara: { due: 0, paid: 100, balance: 100 },
    omar: { due: 500, paid: 0, balance: -500 },
  };

  it("splits the shortfall by available surplus (the 1,000 trip short by 200)", () => {
    const plan = planFill(200, availableSurplus(balances, {}));
    expect(plan).toEqual({ ali: 150, sara: 50 });
  });

  it("does not reuse surplus already covering another activity", () => {
    const effective = effectiveFills([
      { activityId: "trip", userId: "ali", amount: 150, total: 1000, tagged: 800 },
      { activityId: "trip", userId: "sara", amount: 50, total: 1000, tagged: 800 },
    ]);
    expect(availableSurplus(balances, effective)).toEqual({ ali: 150, sara: 50 });
  });

  it("fills partially when the surplus is smaller than the shortfall", () => {
    expect(planFill(1000, { ali: 300, sara: 100 })).toEqual({ ali: 300, sara: 100 });
  });

  it("shrinks fills when tagged payments arrive later, freeing surplus", () => {
    const effective = effectiveFills([
      { activityId: "trip", userId: "ali", amount: 150, total: 1000, tagged: 900 },
      { activityId: "trip", userId: "sara", amount: 50, total: 1000, tagged: 900 },
    ]);
    expect(effective.trip).toEqual({ ali: 75, sara: 25 });
    expect(availableSurplus(balances, effective)).toEqual({ ali: 225, sara: 75 });
  });

  it("counts a fill as the filler's contribution to the activity", () => {
    const split = { total: 1000, dues: { omar: 1000 }, unset: [], unassigned: 0 };
    const r = activitySummary(split, activityPaid([{ payerId: "omar", payeeId: null, amount: 800 }]), { ali: 150, sara: 50 });
    expect(r.rows.find((x) => x.userId === "ali")).toEqual({ userId: "ali", due: 0, paid: 150, fromSurplus: 150, left: -150 });
    expect(r.filled).toBe(200);
    expect(paymentsCover(1000, [{ amount: 800 }], r.filled)).toBe(true);
  });
});
