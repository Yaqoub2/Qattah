import { getTranslations } from "next-intl/server";
import { toCsv } from "@/lib/csv";
import { isoDay } from "@/lib/format";
import { fromMinor } from "@/lib/money";
import { activityPaid, activityParticipants, activitySummary, effectiveFills, splitActivity } from "@/lib/ledger";
import { computeGroupLedger } from "@/server/group-ledger";
import { ledgerMembers, listEntries, listExpenses, listFills, listPayments, loadActivity, loadGroup } from "@/server/queries";
import { getSessionUser } from "@/server/session";

/**
 * GET ?kind=summary   one row per member: paid, due, balance (same ledger as the screens).
 * GET ?kind=transactions   every expense and payment, oldest first.
 * With &activityId=… both kinds are scoped to that activity (same calculation as its screen).
 * Amounts are in major units (e.g. 12.50) so spreadsheets can sum them.
 */
export async function GET(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "transactions" ? "transactions" : "summary";
  const locale = url.searchParams.get("locale") === "en" ? "en" : "ar";

  const user = await getSessionUser();
  if (!user) return new Response("unauthenticated", { status: 401 });
  const group = await loadGroup(groupId, user.id);
  if (!group) return new Response("not found", { status: 404 });

  const t = await getTranslations({ locale });
  const major = (v: number) => fromMinor(v, group.currency);
  const names = new Map(group.members.map((m) => [m.userId, m.name]));
  let rows: (string | number | null)[][];
  let scope = kind as string;

  const activityId = url.searchParams.get("activityId");
  if (activityId) {
    const [activity, entries, fillRows] = await Promise.all([
      loadActivity(groupId, activityId),
      listEntries(groupId, activityId),
      listFills(groupId, activityId),
    ]);
    if (!activity) return new Response("not found", { status: 404 });
    scope = `${activity.title}-${kind}`;
    const expenses = activity.expenses.filter((e) => e.approvedAt);
    const payments = activity.payments.filter((p) => p.approvedAt);
    const fills = effectiveFills(fillRows)[activityId] ?? {};
    if (kind === "summary") {
      const total = expenses.reduce((sum, e) => sum + e.amount, 0);
      const split = splitActivity(total, activityParticipants({ ...activity, total }, ledgerMembers(group), entries));
      const report = activitySummary(split, activityPaid(payments), fills);
      rows = [
        [t("report.member"), t("ledger.due"), t("ledger.paid"), t("fill.fromSurplusColumn"), t("activity.left"), group.currency],
        ...report.rows.map((row) => [
          names.get(row.userId) ?? null,
          major(row.due),
          major(row.paid),
          major(row.fromSurplus),
          major(row.left),
          null,
        ]),
      ];
    } else {
      rows = [
        [t("report.date"), t("report.type"), t("report.description"), t("payment.payer"), t("payment.payee"), `${t("expense.amount")} (${group.currency})`],
        ...expenses.map((e) => [isoDay(activity.startsOn), t("expense.title"), e.title, null, null, major(e.amount)]),
        ...payments.map((p) => [
          isoDay(p.paidOn),
          t("nav.payments"),
          p.note,
          names.get(p.payerId) ?? null,
          p.payeeId ? (names.get(p.payeeId) ?? null) : t("payment.toGroup"),
          major(p.amount),
        ]),
        ...Object.entries(fills)
          .filter(([, v]) => v > 0)
          .map(([userId, v]) => [null, t("fill.title"), t("fill.fromSurplusOf", { name: names.get(userId) ?? "" }), names.get(userId) ?? null, t("payment.toGroup"), major(v)]),
      ];
    }
  } else if (kind === "summary") {
    const { byUser } = (await computeGroupLedger(groupId, group))!;
    rows = [
      [t("report.member"), t("ledger.paid"), t("ledger.due"), t("report.balance"), group.currency],
      ...group.members.map((m) => {
        const b = byUser[m.userId];
        return [m.name, major(b.paid), major(b.due), major(b.balance), null];
      }),
    ];
  } else {
    const [expenses, payments] = await Promise.all([listExpenses(groupId), listPayments(groupId)]);
    rows = [
      [t("report.date"), t("report.type"), t("report.activity"), t("report.description"), t("payment.payer"), t("payment.payee"), `${t("expense.amount")} (${group.currency})`],
      ...expenses.map((e) => [isoDay(e.startsOn), t("expense.title"), e.activity, e.title, null, null, major(e.amount)]),
      ...payments
        .filter((p) => p.approvedAt)
        .reverse()
        .map((p) => [
          isoDay(p.paidOn),
          t("nav.payments"),
          p.activity?.title ?? null,
          p.note,
          names.get(p.payerId) ?? null,
          p.payeeId ? (names.get(p.payeeId) ?? null) : t("payment.toGroup"),
          major(p.amount),
        ]),
    ];
  }

  const filename = `${`${group.name}-${scope}`.replace(/[^\p{L}\p{N}]+/gu, "-")}-${isoDay(new Date())}.csv`;
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
