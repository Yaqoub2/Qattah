-- Fills: part of an activity's shortfall covered by members' surplus through the group budget.
-- CreateTable
CREATE TABLE "public"."activity_fills" (
    "activity_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_fills_pkey" PRIMARY KEY ("activity_id","user_id")
);

-- CreateIndex
CREATE INDEX "activity_fills_group_id_idx" ON "public"."activity_fills"("group_id");

-- AddForeignKey
ALTER TABLE "public"."activity_fills" ADD CONSTRAINT "activity_fills_activity_id_group_id_fkey" FOREIGN KEY ("activity_id", "group_id") REFERENCES "public"."activities"("id", "group_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_fills" ADD CONSTRAINT "activity_fills_group_id_user_id_fkey" FOREIGN KEY ("group_id", "user_id") REFERENCES "public"."group_members"("group_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "activity_fills" ADD CONSTRAINT "activity_fills_amount_positive" CHECK ("amount" > 0);
-- Same rule as activity_members: no changes once the activity is closed.
CREATE TRIGGER "activity_fills_guard" BEFORE INSERT OR UPDATE OR DELETE ON "activity_fills"
  FOR EACH ROW EXECUTE FUNCTION "activity_members_guard"();
