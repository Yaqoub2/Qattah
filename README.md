# قطة / Qattah

Mobile-first, Arabic/English group expense ledger. Every member sees what they paid, what they owe, and their balance. No money moves in the app.

## How the ledger works

- A **group** is independent: its own members, activities, expenses and payments.
- An **activity** groups expenses (a trip, a month). Its total is the sum of its expenses.
- **Who owes an activity**
  - Paying members: every activity dated on or after their start date.
  - Other members: only activities they are listed on.
- **How much**: the member's rule (fixed amount, percentage, or shares). The activity can override it. With no rule, the member shows up as "set a due" on that activity. Fixed amounts are taken first, then percentages of the total, then shares split what is left. The split is exact to the halala, with no rounding drift.
- **Payments** are the only record of money paid. A payment goes to the group, or to a member. A payment to a member is deducted from what that member has paid. It can be tagged to an activity for display; balances do not depend on the tag.
- **Paid** = paid out − received from members. **Balance** = paid − due across all activities. A positive balance is credit that covers later dues automatically.
- **Group cash** = money paid into the group − expenses. It always equals the sum of all balances, minus any expense amounts not yet assigned to anyone.
- **Approvals**: an expense or payment a member submits is *pending* until an admin approves it. Pending rows are not part of any total, balance, reminder or export. Admin entries count at once. Rejecting deletes the entry and its receipt. Members can withdraw only their own pending entries; once approved, only an admin can delete it.
- **Who paid an activity**: only approved payments tagged with the activity count toward it. A tagged payment to a member moves that amount from the payee to the payer. Each participant sees their due, what they paid, and what is left or paid extra. Untagged payments are general credit and appear only in the overall balance.
- **Allocations are not used.** Payments are not tied to specific expenses. Paid is a running total, so extra payment covers later dues automatically, as `AGENTS.md` requires.
- **Closed activities**: an admin closes an activity once its expenses are final. Closing freezes each participant's current due as a fixed amount in `activity_members`, so later changes to members' rules or start dates can't change it. After that, expenses and rules on that activity can't be added, edited or deleted. Payments tagged to it are still allowed. Closing is refused while expenses are pending or the split is incomplete. Reopening keeps the frozen amounts as overrides.
- **Fixed (sealed) expenses**: a fixed expense's amount can never change, and it can't be deleted or unfixed. Other expenses are variable: an admin can edit their amount up or down. An admin can mark an expense fixed when adding it, or later.
- Both rules are enforced by database triggers (`expenses_guard`, `activity_members_guard`), not just by the app.
- Baseline is out of scope and not implemented.

All of the math is in `src/lib/ledger.ts`: pure functions, tested in `src/lib/ledger.test.ts`.

## Code layout

| Layer | Path | Role |
| --- | --- | --- |
| Model | `prisma/schema.prisma`, `prisma/migrations` | Tables, keys, CHECK constraints |
| Domain | `src/lib/ledger.ts` | Due, paid, balance calculations (no I/O) |
| Reads | `src/server/queries.ts` | Every SELECT the app runs |
| Writes | `src/actions/*.ts` | Validate, check role, one write each |
| Views | `src/app/[locale]/**/page.tsx`, `src/components` | Server-rendered screens |
| Channels | `src/server/channels.ts`, `src/app/api/telegram` | Email and Telegram codes |

## Tables

| Table | Purpose | Keys and indexes |
| --- | --- | --- |
| `users` | Person; email and/or phone (E.164, used for Telegram) | PK id; unique email; unique phone; CHECK phone format; CHECK at least one |
| `sessions` | Revocable login; checked on writes only | PK id; index user_id |
| `otp_challenges` | Hashed 6-digit code, 10 min, 5 attempts, 5 per day | index (identifier, created_at desc) |
| `telegram_chats` | Phone → Telegram chat id, written when a user shares their own contact with the bot | PK phone; unique chat_id; CHECK phone format |
| `groups` | Name, currency | PK id |
| `group_members` | Role, paying flag, start date, default rule | PK (group_id, user_id); index user_id; CHECK on the rule |
| `activities` | Title, date, closed_at | PK id; unique (id, group_id); index (group_id, starts_on desc) |
| `activity_members` | Lists an other member on an activity, or overrides a rule | PK (activity_id, user_id); index group_id; FKs to the activity and the member in the same group |
| `expenses` | Title, amount, sealed, receipt path, approval (approved_at, approved_by_id), inside one activity | index (group_id, activity_id); partial index (group_id, created_at) WHERE pending; CHECK approval columns set together; FK (activity_id, group_id); CHECK amount > 0 |
| `payments` | Payer, optional payee and activity, amount, date, receipt path, approval | index (group_id, paid_on desc); index activity_id; partial index (group_id, created_at) WHERE pending; CHECK approval columns set together; FKs to payer and payee in the same group; CHECK amount > 0, payer ≠ payee |
| `payment_methods` | A bank (IBAN), link, QR image or other way to pay; owned by a member or by a group | index user_id; index group_id; CHECK exactly one owner; CHECK the fields each kind needs |
| `reminders` | Sent reminders: log plus rate limit (one per member every 20 h) | index (group_id, user_id, sent_at desc); FK to the member in the group; CHECK amount > 0 |

All money is stored as integer minor units. Composite foreign keys keep a member, activity or payment from another group from being mixed in. Removing a member who has payments is refused, so history is never lost.

## Queries per screen

**Sessions**: the signed login cookie carries the user (id, name, email, phone, locale), so pages run no session query. Writes check the `sessions` row in the same query as the membership check, so logging out revokes write access immediately. Pages already open on another device stay readable until the cookie expires (30 days). Changing your name or language reissues the cookie.

**Round trips**: relations load in the same SQL statement (Prisma `relationJoins`). Group pages run the membership check (`loadGroup`) in parallel with their data queries. A page is one round of parallel queries, plus one more for admin-only data on the overview and one Storage signing call where files are shown. The data for a page that 404s is fetched but never rendered.

- **Groups list**: `group_members` by user_id, joined to `groups` (1 query).
- **Group overview**: the group with its members (1 SELECT, also the access check), activity totals (1 aggregate), `activity_members` for the group, and payment totals per member (1 aggregate over `payments(group_id)`). Both aggregates count approved rows only. Balances are computed in memory, so there are no per-row queries. Admins also get the approval queue (2 SELECTs on the partial pending indexes), the members reminded in the last 20 hours, and one signing call for queue receipts.
- **Activity**: the group with its members, then the activity, its expenses, its payments, and its `activity_members`.
- **Payments**: the group with its members, the latest 100 payments, the activity picker (50), and payment methods for the group and its members (1 SELECT). One Storage call signs every receipt and QR image on the page.
- **Members**: the group with its members.
- **Reports**: the same 3 ledger queries as the overview. Per-activity dues come from the same calculation, so reports and the overview always agree.
- **Export** (`/api/groups/:id/export?kind=summary|transactions`): summary uses the ledger queries; transactions read every expense (joined to its activity) and every payment. CSV with a UTF-8 BOM so Excel shows Arabic. With `&activityId=…`, both kinds cover one activity: the activity, its expenses, its payments and its `activity_members` (the same 4 SELECTs as the activity screen).
- **Activity report** (a section on the activity screen): computed from data the screen already loaded, so it adds no queries.
- **Profile**: your payment methods, plus one signing call for QR images.
- **Reminder**: membership check, a cooldown lookup, the group with its members, the 3 ledger queries, the send, then one INSERT.
- **Close activity**: the group with its members, the activity, and its `activity_members`, then one transaction: an upsert per participant plus one conditional UPDATE.
- **Writes**: one query checks the session, membership and role, and returns the group's currency, then one INSERT, UPDATE or DELETE. Approve is one conditional UPDATE (`WHERE approved_at IS NULL`), so approving twice is a no-op. Adding a member and deleting an activity each run in one transaction.

The two partial "pending" indexes and all CHECK constraints are written in SQL at the end of the single `init` migration, because Prisma's schema can't express partial indexes. If `prisma migrate dev` ever proposes dropping them, keep them.

## Receipts and QR images

Files go to a **private** Supabase Storage bucket, under `groups/<id>/receipts/` or `.../methods/`. The database stores only the object path. Pages show signed links that expire after one hour, all generated in one batch request per page. Accepted files are JPG, PNG, WebP, HEIC and PDF, up to 4 MB. Deleting an expense, payment, activity or payment method also deletes its files. If Storage is not configured, the receipt fields are hidden.

## Local development

Needs Node 22 and Docker.

```bash
cp .env.example .env              # then set SESSION_SECRET: openssl rand -hex 32
npm install                       # also runs prisma generate
npm run db:up                     # Postgres 16 in Docker on port 5432
npm run db:migrate                # applies prisma/migrations (one init migration)
npm run dev                       # http://localhost:3000
```

With `AUTH_DEV_LOG_OTP=true` and no SMTP or Telegram configured, sign-in codes are printed in the `npm run dev` terminal.

Other commands:

```bash
npm run db:reset                  # wipe the local database and re-apply the migration
npm test && npx tsc --noEmit && npm run lint && npm run build
npm run db:down                   # stop Postgres (data is kept in the qattah-pgdata volume)
```

## Deploy: Supabase (database and storage)

1. Create a project at [supabase.com](https://supabase.com). In **Connect → ORMs → Prisma**, copy:
   - the **transaction pooler** URI (port 6543): this is `DATABASE_URL`, with `?pgbouncer=true` added;
   - the **session pooler** URI (port 5432): this is `DIRECT_URL`, used only for migrations.
2. Apply the schema from your machine:

```bash
export DATABASE_URL="postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true"
export DIRECT_URL="postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
npx prisma migrate deploy
```

3. Create the **private** receipts bucket. In **Project Settings → API**, copy the project URL and the `service_role` key, then:

```bash
export SUPABASE_URL="https://PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."
curl -X POST "$SUPABASE_URL/storage/v1/bucket" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d '{"id":"qattah","name":"qattah","public":false}'
```

Or create it in the dashboard under **Storage → New bucket**, with "Public" turned off. Keep the `service_role` key server-side only. It is never sent to the browser.

## Deploy: Netlify (builds from GitHub)

One-time setup:

1. In Netlify: **Add new site → Import an existing project → GitHub**, pick this repository, and set the production branch to `main`. The build settings come from `netlify.toml`.
2. In **Site configuration → Environment variables**, add:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler, port 6543, ending in `?pgbouncer=true` |
| `DIRECT_URL` | Supabase session pooler, port 5432 (used by migrations during the build) |
| `SESSION_SECRET` | output of `openssl rand -hex 32` |
| `APP_URL` | `https://YOUR-SITE.netlify.app` (or your custom domain) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Storage for receipts |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email codes |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_TELEGRAM_BOT` | Telegram codes (bot username without @) |
| `AUTH_DEV_LOG_OTP` | `false` |

3. In **Site configuration → Functions**, set the region to the same as Supabase (for example `ap-northeast-2`), if your plan allows choosing one.

After that, every push to `main` deploys:

```bash
git push origin main
```

A production build runs `prisma migrate deploy` (through `DIRECT_URL`), `next build`, then `scripts/set-telegram-webhook.mjs`. That script points the bot at `APP_URL/api/telegram`. Deploy previews only build. They don't migrate or touch the bot.

Each function keeps one database connection (`connection_limit=1`, set automatically on Netlify), and Supabase's transaction pooler shares connections across them.

For schema changes: edit `prisma/schema.prisma`, run `npx prisma migrate dev --name what_changed` locally, commit the new migration, and push. The production build applies it.

### Telegram (codes by phone number)

1. In Telegram, message @BotFather, send `/newbot`, and copy the token and the bot username into the Netlify variables above.
2. Push to `main`. The production build registers the webhook. To check it:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"   # url = your site, no last_error_message
```

A bot can have only one webhook. A site running on your machine can't receive Telegram messages: the bot stays silent locally, and codes for phones print in the dev terminal when `AUTH_DEV_LOG_OTP=true`.

Users open the bot, tap **Share my number**, then sign in with their phone number (`05xxxxxxxx` or `+9665…`). The bot accepts only the sender's own contact. Local numbers default to +966 (`DEFAULT_COUNTRY_CODE` in `src/lib/phone.ts`).

WhatsApp is planned. Add it as another channel in `src/server/channels.ts`.

## Tests

```bash
npm test
```
