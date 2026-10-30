import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSessionUser } from "@/lib/session";
import { isAdminRole } from "@/lib/quota";
import { fromMinor } from "@/lib/money";
import { collectedOf, collectionStatus, displayedBaseline } from "@/lib/ledger";
import { getTranslations } from "next-intl/server";
import {
  getGroupExpenses,
  getGroupMembers,
  getGroupMembership,
  getGroupPayments,
} from "@/lib/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { groupId } = await params;
  const membership = await getGroupMembership(groupId, user.id);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const locale = user.locale === "en" ? "en" : "ar";
  const t = await getTranslations({ locale, namespace: "report" });
  const admin = isAdminRole(membership.role);
  const activityId = req.nextUrl.searchParams.get("activityId");
  const expenseId = req.nextUrl.searchParams.get("expenseId");
  const userId = req.nextUrl.searchParams.get("userId");

  const [members, allExpenses, allPayments] = await Promise.all([
    getGroupMembers(groupId),
    getGroupExpenses(groupId),
    getGroupPayments(groupId),
  ]);
  if (userId && !members.some((m) => m.userId === userId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const expenses = allExpenses.filter(
    (e) =>
      e.approvalStatus === "approved" &&
      (!activityId || e.activityId === activityId) &&
      (!expenseId || e.id === expenseId) &&
      (!userId ||
        e.shares.some((s) => s.userId === userId && s.included) ||
        e.payers.some((p) => p.userId === userId) ||
        e.allocations.some((a) => a.payment?.payerUserId === userId)),
  );
  const payments = allPayments.filter(
    (p) => p.approvalStatus === "approved" && (!userId || p.payerUserId === userId),
  );
  const exportMembers = userId ? members.filter((m) => m.userId === userId) : members;

  const wb = new ExcelJS.Workbook();
  const cur = membership.group.currency;
  const bal = wb.addWorksheet(t("balances"));
  bal.addRow(
    admin
      ? [t("colName"), t("colPhone"), t("colEmail"), t("colPaying"), t("colDue"), t("colPaid"), t("colNet")]
      : [t("colName"), t("colPhone"), t("colEmail"), t("colDue"), t("colPaid"), t("colNet")],
  );
  for (const m of exportMembers) {
    const row: (string | number | boolean | null | undefined)[] = [m.user.name, m.user.phone, m.user.email];
    if (admin) row.push(m.isPayingUser);
    row.push(fromMinor(m.dueAmount, cur), fromMinor(m.paidAmount, cur), fromMinor(m.netAmount, cur));
    bal.addRow(row);
  }
  const ex = wb.addWorksheet(t("expenses"));
  ex.addRow([t("colActivity"), t("colTitle"), t("colAmount"), t("colSplit"), t("colStatus")]);
  for (const e of expenses) {
    ex.addRow([
      e.activity.title,
      e.title,
      fromMinor(e.amount, cur),
      e.splitMethod,
      collectionStatus(e.amount, collectedOf(e)),
    ]);
  }
  const sh = wb.addWorksheet(t("shares"));
  sh.addRow([t("colExpense"), t("colUser"), t("colDue"), t("colBaseline")]);
  for (const e of expenses) {
    for (const s of e.shares) {
      if (userId && s.userId !== userId) continue;
      const mem = members.find((m) => m.userId === s.userId);
      const collected = collectedOf(e);
      sh.addRow([
        e.title,
        mem?.user.name,
        fromMinor(s.dueAmount, cur),
        fromMinor(displayedBaseline(s.baselineAmount, collected, e.amount), cur),
      ]);
    }
  }
  const pay = wb.addWorksheet(t("payments"));
  pay.addRow([t("colPayer"), t("colAmount"), t("colNotes"), t("colPaidAt")]);
  for (const p of payments) {
    pay.addRow([p.payer.name, fromMinor(p.amount, cur), p.notes, p.paidAt.toISOString()]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="qattah-${userId ? `member-${userId.slice(0, 8)}` : groupId.slice(0, 8)}.xlsx"`,
    },
  });
}
