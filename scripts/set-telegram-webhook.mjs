// Points the Telegram bot at this deployment's /api/telegram. Runs after production builds on Netlify.
// Netlify sets URL (the site's main address); APP_URL wins when set. Skips quietly if Telegram isn't configured.
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const base = process.env.APP_URL || process.env.URL;

if (!token || !secret || !base || base.includes("localhost")) {
  console.log("[telegram] webhook not set: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and a public APP_URL are required");
  process.exit(0);
}

const url = `${base.replace(/\/$/, "")}/api/telegram`;
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true }),
});
const body = await res.json().catch(() => ({}));
if (!body.ok) {
  console.error("[telegram] setWebhook failed:", body.description ?? res.status);
  process.exit(1);
}
console.log(`[telegram] webhook -> ${url}`);
