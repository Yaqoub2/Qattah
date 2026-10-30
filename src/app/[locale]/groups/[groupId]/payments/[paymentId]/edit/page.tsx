import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { PaymentForm } from "@/components/payment-form";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isAdminRole } from "@/lib/quota";
import {
  getApprovedExpenseOptions,
  getGroupMembers,
  getGroupMembership,
  getPaymentDetail,
} from "@/lib/workspace";

export default async function EditPaymentPage({
  params,
}: {
  params: Promise<{ groupId: string; paymentId: string }>;
}) {
  const user = await requirePageUser();
  const { groupId, paymentId } = await params;
  const [membership, members, expenses, payment] = await Promise.all([
    getGroupMembership(groupId, user.id),
    getGroupMembers(groupId),
    getApprovedExpenseOptions(groupId),
    getPaymentDetail(groupId, paymentId),
  ]);
  if (!payment || !membership) notFound();
  if (payment.approvalStatus !== "pending") notFound();
  const admin = isAdminRole(membership.role);
  if (!admin && payment.payerUserId !== user.id) notFound();
  const t = await getTranslations("payment");
  const memberOpts = members.map((m) => ({ userId: m.userId, name: m.user.name }));
  if (!memberOpts.some((m) => m.userId === payment.payerUserId)) {
    memberOpts.unshift({ userId: payment.payerUserId, name: payment.payer.name });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand compact showRefresh refreshGroupId={groupId} />
      <h1 className="mt-6 text-2xl font-bold">{t("edit")}</h1>
      <div className="mt-4">
        <PaymentForm
          groupId={groupId}
          currency={membership.group.currency}
          members={memberOpts}
          expenses={expenses.map((e) => ({ id: e.id, title: e.title, amount: e.amount }))}
          defaultPayer={payment.payerUserId}
          defaultExpenseId={payment.allocations[0]?.expenseId}
          defaultAmountMinor={payment.amount}
          defaultNotes={payment.notes ?? ""}
          allowOutsidePayers={admin}
          paymentId={payment.id}
          lockPayer={!admin}
        />
      </div>
      <BottomNav />
    </div>
  );
}
