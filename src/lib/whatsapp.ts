export async function sendWhatsApp(to: string, body: string, template?: { name: string; params: string[] }) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    if (process.env.AUTH_DEV_LOG_OTP === "true") {
      console.info(`[whatsapp:dev] to=${to} body=${body}`);
      return { ok: true, dev: true };
    }
    throw new Error("whatsapp_not_configured");
  }

  const payload = template
    ? {
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: template.name,
          language: { code: "ar" },
          components: [
            {
              type: "body",
              parameters: template.params.map((text) => ({ type: "text", text })),
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "text",
        text: { body },
      };

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`whatsapp_failed:${err}`);
  }
  return { ok: true };
}
