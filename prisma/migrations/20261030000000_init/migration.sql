-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "public"."SplitMethod" AS ENUM ('amount', 'shares', 'percentage');

-- CreateEnum
CREATE TYPE "public"."Channel" AS ENUM ('email', 'telegram');

-- CreateEnum
CREATE TYPE "public"."MethodKind" AS ENUM ('bank', 'link', 'qr', 'other');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "locale" VARCHAR(2) NOT NULL DEFAULT 'ar',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."otp_challenges" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "channel" "public"."Channel" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."telegram_chats" (
    "phone" TEXT NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "telegram_chats_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "public"."groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."group_members" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'member',
    "is_paying" BOOLEAN NOT NULL DEFAULT false,
    "starts_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "split_method" "public"."SplitMethod",
    "split_value" DECIMAL(14,4),

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "public"."activities" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "starts_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."activity_members" (
    "activity_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "split_method" "public"."SplitMethod",
    "split_value" DECIMAL(14,4),

    CONSTRAINT "activity_members_pkey" PRIMARY KEY ("activity_id","user_id")
);

-- CreateTable
CREATE TABLE "public"."expenses" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "receipt_path" TEXT,
    "sealed" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payments" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "activity_id" UUID,
    "payer_id" UUID NOT NULL,
    "payee_id" UUID,
    "amount" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "receipt_path" TEXT,
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payment_methods" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "group_id" UUID,
    "kind" "public"."MethodKind" NOT NULL,
    "label" TEXT NOT NULL,
    "iban" TEXT,
    "beneficiary" TEXT,
    "link_url" TEXT,
    "qr_path" TEXT,
    "details" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reminders" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sent_by_id" UUID NOT NULL,
    "channel" "public"."Channel" NOT NULL,
    "amount" INTEGER NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "public"."users"("phone");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "public"."sessions"("user_id");

-- CreateIndex
CREATE INDEX "otp_challenges_identifier_created_at_idx" ON "public"."otp_challenges"("identifier", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_chats_chat_id_key" ON "public"."telegram_chats"("chat_id");

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "public"."group_members"("user_id");

-- CreateIndex
CREATE INDEX "activities_group_id_starts_on_idx" ON "public"."activities"("group_id", "starts_on" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "activities_id_group_id_key" ON "public"."activities"("id", "group_id");

-- CreateIndex
CREATE INDEX "activity_members_group_id_idx" ON "public"."activity_members"("group_id");

-- CreateIndex
CREATE INDEX "expenses_group_id_activity_id_idx" ON "public"."expenses"("group_id", "activity_id");

-- CreateIndex
CREATE INDEX "payments_group_id_paid_on_idx" ON "public"."payments"("group_id", "paid_on" DESC);

-- CreateIndex
CREATE INDEX "payments_activity_id_idx" ON "public"."payments"("activity_id");

-- CreateIndex
CREATE INDEX "payment_methods_user_id_idx" ON "public"."payment_methods"("user_id");

-- CreateIndex
CREATE INDEX "payment_methods_group_id_idx" ON "public"."payment_methods"("group_id");

-- CreateIndex
CREATE INDEX "reminders_group_id_user_id_sent_at_idx" ON "public"."reminders"("group_id", "user_id", "sent_at" DESC);

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activities" ADD CONSTRAINT "activities_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_members" ADD CONSTRAINT "activity_members_activity_id_group_id_fkey" FOREIGN KEY ("activity_id", "group_id") REFERENCES "public"."activities"("id", "group_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_members" ADD CONSTRAINT "activity_members_group_id_user_id_fkey" FOREIGN KEY ("group_id", "user_id") REFERENCES "public"."group_members"("group_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expenses" ADD CONSTRAINT "expenses_activity_id_group_id_fkey" FOREIGN KEY ("activity_id", "group_id") REFERENCES "public"."activities"("id", "group_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_activity_id_group_id_fkey" FOREIGN KEY ("activity_id", "group_id") REFERENCES "public"."activities"("id", "group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_group_id_payer_id_fkey" FOREIGN KEY ("group_id", "payer_id") REFERENCES "public"."group_members"("group_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_group_id_payee_id_fkey" FOREIGN KEY ("group_id", "payee_id") REFERENCES "public"."group_members"("group_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_methods" ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_methods" ADD CONSTRAINT "payment_methods_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reminders" ADD CONSTRAINT "reminders_group_id_user_id_fkey" FOREIGN KEY ("group_id", "user_id") REFERENCES "public"."group_members"("group_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity rules Prisma cannot express
ALTER TABLE "users" ADD CONSTRAINT "users_has_identifier" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);
ALTER TABLE "users" ADD CONSTRAINT "users_phone_e164" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE "users" ADD CONSTRAINT "users_locale" CHECK ("locale" IN ('ar', 'en'));
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_phone_e164" CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_split" CHECK (
  ("split_method" IS NULL) = ("split_value" IS NULL)
  AND ("split_method" IS NULL
  OR ("split_method" = 'amount' AND "split_value" >= 0 AND "split_value" = trunc("split_value"))
  OR ("split_method" = 'shares' AND "split_value" > 0)
  OR ("split_method" = 'percentage' AND "split_value" > 0 AND "split_value" <= 100))
);
ALTER TABLE "activity_members" ADD CONSTRAINT "activity_members_split" CHECK (
  ("split_method" IS NULL) = ("split_value" IS NULL)
  AND ("split_method" IS NULL
  OR ("split_method" = 'amount' AND "split_value" >= 0 AND "split_value" = trunc("split_value"))
  OR ("split_method" = 'shares' AND "split_value" > 0)
  OR ("split_method" = 'percentage' AND "split_value" > 0 AND "split_value" <= 100))
);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approval_pair" CHECK (("approved_at" IS NULL) = ("approved_by_id" IS NULL));
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_not_self" CHECK ("payee_id" IS NULL OR "payee_id" <> "payer_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_approval_pair" CHECK (("approved_at" IS NULL) = ("approved_by_id" IS NULL));
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_one_owner" CHECK (num_nonnulls("user_id", "group_id") = 1);
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_fields" CHECK (
  ("kind" <> 'bank' OR "iban" IS NOT NULL)
  AND ("kind" <> 'link' OR "link_url" IS NOT NULL)
  AND ("kind" <> 'qr' OR "qr_path" IS NOT NULL)
);
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_amount_positive" CHECK ("amount" > 0);

-- Approval queue: only pending rows are indexed
CREATE INDEX "expenses_pending_idx" ON "expenses" ("group_id", "created_at") WHERE "approved_at" IS NULL;
CREATE INDEX "payments_pending_idx" ON "payments" ("group_id", "created_at") WHERE "approved_at" IS NULL;

-- Closed activities and sealed expenses, enforced for every writer (errors are mapped to messages in src/server/action.ts).
-- An admin must close the activity through the app, which first freezes each participant's due into activity_members.
CREATE FUNCTION "expenses_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "activities"
    WHERE "id" IN (CASE WHEN TG_OP = 'DELETE' THEN OLD."activity_id" ELSE NEW."activity_id" END,
                   CASE WHEN TG_OP = 'INSERT' THEN NEW."activity_id" ELSE OLD."activity_id" END)
      AND "closed_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'activity_closed';
  END IF;
  IF TG_OP = 'DELETE' AND OLD."sealed" THEN
    RAISE EXCEPTION 'expense_sealed';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."sealed" AND (NOT NEW."sealed" OR NEW."amount" <> OLD."amount" OR NEW."activity_id" <> OLD."activity_id") THEN
    RAISE EXCEPTION 'expense_sealed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "expenses_guard" BEFORE INSERT OR UPDATE OR DELETE ON "expenses"
  FOR EACH ROW EXECUTE FUNCTION "expenses_guard"();

CREATE FUNCTION "activity_members_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "activities"
    WHERE "id" = (CASE WHEN TG_OP = 'DELETE' THEN OLD."activity_id" ELSE NEW."activity_id" END) AND "closed_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'activity_closed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "activity_members_guard" BEFORE INSERT OR UPDATE OR DELETE ON "activity_members"
  FOR EACH ROW EXECUTE FUNCTION "activity_members_guard"();
