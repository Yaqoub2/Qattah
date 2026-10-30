-- AlterTable
ALTER TABLE "public"."groups" ADD COLUMN "budget_amount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."group_members" ADD COLUMN "baseline_amount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."expenses" ADD COLUMN "budget_paid_amount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."payments" ADD COLUMN "from_budget" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."group_budget_events" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "expense_id" UUID,
    "payment_id" UUID,
    "actor_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_budget_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "public"."group_members"("user_id");

-- CreateIndex
CREATE INDEX "activities_group_id_status_idx" ON "public"."activities"("group_id", "status");

-- CreateIndex
CREATE INDEX "expenses_group_id_approval_status_idx" ON "public"."expenses"("group_id", "approval_status");

-- CreateIndex
CREATE INDEX "expense_shares_user_id_idx" ON "public"."expense_shares"("user_id");

-- CreateIndex
CREATE INDEX "expense_payers_user_id_idx" ON "public"."expense_payers"("user_id");

-- CreateIndex
CREATE INDEX "payments_group_id_approval_status_idx" ON "public"."payments"("group_id", "approval_status");

-- CreateIndex
CREATE INDEX "payments_payer_user_id_idx" ON "public"."payments"("payer_user_id");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "public"."payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "user_payment_methods_user_id_idx" ON "public"."user_payment_methods"("user_id");

-- CreateIndex
CREATE INDEX "group_payment_methods_group_id_idx" ON "public"."group_payment_methods"("group_id");

-- CreateIndex
CREATE INDEX "invite_tokens_group_id_idx" ON "public"."invite_tokens"("group_id");

-- CreateIndex
CREATE INDEX "group_budget_events_group_id_created_at_idx" ON "public"."group_budget_events"("group_id", "created_at");

-- AddForeignKey
ALTER TABLE "public"."group_budget_events" ADD CONSTRAINT "group_budget_events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
