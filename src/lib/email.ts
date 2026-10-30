import nodemailer from "nodemailer";

export async function sendEmail(to: string, subject: string, text: string) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (process.env.AUTH_DEV_LOG_OTP === "true") {
      console.info(`[email:dev] to=${to} subject=${subject}\n${text}`);
      return { ok: true, dev: true };
    }
    throw new Error("smtp_not_configured");
  }
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? "قطة <noreply@localhost>",
    to,
    subject,
    text,
  });
  return { ok: true };
}
