-- Drop stored derived amounts; ledger is computed in the app.

ALTER TABLE "public"."groups" DROP COLUMN IF EXISTS "budget_amount";

ALTER TABLE "public"."group_members" DROP COLUMN IF EXISTS "net_amount";
ALTER TABLE "public"."group_members" DROP COLUMN IF EXISTS "due_amount";
ALTER TABLE "public"."group_members" DROP COLUMN IF EXISTS "paid_amount";
ALTER TABLE "public"."group_members" DROP COLUMN IF EXISTS "baseline_amount";

ALTER TABLE "public"."expenses" DROP COLUMN IF EXISTS "collection_status";

DROP TYPE IF EXISTS "public"."CollectionStatus";
