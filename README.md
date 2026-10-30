# قطة / Qattah

Mobile-first bilingual (Arabic / English) group expense app. **Baseline** (coverage from the paying-user pool) is shown to everyone; **due** is the fair split. Cash-friendly: no in-app money movement.

## Stack

One Next.js app. **Supabase** is Postgres + file storage. No Redis, no extra workers.

## Setup

### Local database (recommended for development)

Postgres runs in Docker. Schema is the same as hosted Supabase; Storage can stay on the cloud project.

```bash
cp .env.example .env   # or keep your existing .env
npm run db:up
npx prisma migrate deploy
```

`.env` should use:

- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres`
- `DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres`

This is an empty database. Log in again after switching from cloud. Stop it with `npm run db:down` (data stays in the Docker volume until you `docker compose down -v`).

### Hosted Supabase

1. Create a [Supabase](https://supabase.com) project.
2. Copy [`.env.example`](.env.example) to `.env` and fill:
   - `DATABASE_URL` — pooled URI (port 6543, `?pgbouncer=true`)
   - `DIRECT_URL` — direct URI (port 5432) for migrations
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`), `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SECRET` — long random string
   - `APP_URL` — public URL (`http://YOUR_IP:3000` or https domain)
   - WhatsApp Cloud API and/or SMTP (leave empty and set `AUTH_DEV_LOG_OTP=true` to print codes in the server log)
3. In Supabase Storage create a **public** bucket named `qattah` (or match `SUPABASE_STORAGE_BUCKET`).
4. Apply the schema:

```bash
npx prisma migrate deploy
```

If this is the first time, `npx prisma migrate deploy` uses `prisma/migrations`. Alternatively `npx prisma db push`.

5. Run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` — you will be sent to `/ar/login`.

## Netlify

The app is a Next.js site. `netlify.toml` runs `prisma generate` and `next build` with the Next runtime plugin. Each function uses `DATABASE_URL` with `connection_limit=1` so the Supabase pooler is not exhausted. Migrations still use `DIRECT_URL` (`npx prisma migrate deploy` from your machine, not inside the function).

Set these in the Netlify site environment (not committed):

- `DATABASE_URL` — pooled URI, port 6543, `?pgbouncer=true`
- `DIRECT_URL` — direct URI, port 5432 (used only if you run migrate in CI)
- `SESSION_SECRET`, `APP_URL` (the Netlify or custom https URL)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- SMTP and/or WhatsApp keys. Leave them empty and set `AUTH_DEV_LOG_OTP=true` only on a non-public site.

```bash
npx netlify login
npx netlify init
npx netlify deploy --build --prod
```

## Production on a public IP

```bash
cp .env.example .env   # edit with real values
npm ci
npx prisma migrate deploy
npm run build
npm start              # listens on 3000
```

Or Docker (app only; database stays on Supabase):

```bash
docker build -t qattah .
docker run --env-file .env -p 3000:3000 qattah
```

Put Caddy/nginx in front if you want HTTPS on a domain. Not required.

## WhatsApp

- OTP uses `WHATSAPP_OTP_TEMPLATE` (Meta authentication template) when set; otherwise a session text (dev / open conversations).
- Reminders are **manual** only. Group quota: **7 / day**, **2 / hour**. Expense collect pre-fills a template you can edit.

## Tests

```bash
npm test                 # ledger golden cases (Vitest)
npx playwright install chromium
npx playwright test      # login RTL smoke
```

## Roles

- **Owner / admin**: members, `is_paying_user`, defaults, approvals, reminders, settings.
- **Member**: if `members_can_submit` is on, they can create expenses/payments as **pending** until an admin approves. Pending rows do not hit the ledger.
