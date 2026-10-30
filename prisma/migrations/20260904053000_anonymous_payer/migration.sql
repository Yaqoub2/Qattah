-- Anonymous payer: not a member of any group. All anonymous payments reference this user.
INSERT INTO "public"."users" ("id", "phone", "name", "locale", "status", "created_at", "updated_at")
SELECT
  '00000000-0000-4000-8000-000000000000',
  '+000000000000',
  'مجهول',
  'ar',
  'disabled',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "public"."users" WHERE "phone" = '+000000000000'
);
