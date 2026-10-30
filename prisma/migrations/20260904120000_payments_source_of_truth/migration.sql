-- AlterTable
ALTER TABLE "public"."expense_payers" ADD COLUMN "payment_id" UUID;

-- AlterTable
ALTER TABLE "public"."payments" DROP COLUMN "from_budget",
DROP COLUMN "to_budget";

-- CreateIndex
CREATE INDEX "expense_payers_payment_id_idx" ON "public"."expense_payers"("payment_id");

-- AddForeignKey
ALTER TABLE "public"."expense_payers" ADD CONSTRAINT "expense_payers_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: merchant payers with no matching allocation become payments + allocations.
WITH to_create AS (
  SELECT
    ep.id AS payer_row_id,
    e.group_id,
    ep.user_id,
    ep.amount,
    ep.expense_id,
    e.created_at,
    e.approval_status,
    gen_random_uuid() AS payment_id
  FROM "public"."expense_payers" ep
  JOIN "public"."expenses" e ON e.id = ep.expense_id
  WHERE ep.payment_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."payment_allocations" pa
      JOIN "public"."payments" p ON p.id = pa.payment_id
      WHERE pa.expense_id = ep.expense_id
        AND p.payer_user_id = ep.user_id
    )
),
ins_pay AS (
  INSERT INTO "public"."payments" ("id", "group_id", "payer_user_id", "amount", "paid_at", "approval_status", "created_at")
  SELECT
    payment_id,
    group_id,
    user_id,
    amount,
    created_at,
    CASE
      WHEN approval_status = 'approved' THEN 'approved'::"public"."ApprovalStatus"
      WHEN approval_status = 'rejected' THEN 'rejected'::"public"."ApprovalStatus"
      ELSE 'pending'::"public"."ApprovalStatus"
    END,
    created_at
  FROM to_create
  RETURNING "id"
),
ins_alloc AS (
  INSERT INTO "public"."payment_allocations" ("id", "payment_id", "expense_id", "amount")
  SELECT gen_random_uuid(), payment_id, expense_id, amount
  FROM to_create
  RETURNING "id"
)
UPDATE "public"."expense_payers" ep
SET "payment_id" = tc.payment_id
FROM to_create tc
WHERE ep.id = tc.payer_row_id;
