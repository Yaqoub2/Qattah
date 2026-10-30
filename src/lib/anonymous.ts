import { prisma } from "@/lib/db";
import { detectIdentifier, normalizePhone } from "@/lib/identity";

export const ANONYMOUS_PHONE = "+000000000000";
export const ANONYMOUS_NAME = "مجهول";

export function isAnonymousPhone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const normalized = normalizePhone(raw) ?? raw.trim();
  return normalized === ANONYMOUS_PHONE || raw.trim() === ANONYMOUS_PHONE;
}

export function isAnonymousUser(user: { phone?: string | null } | null | undefined): boolean {
  return isAnonymousPhone(user?.phone);
}

export async function ensureAnonymousUser() {
  const existing = await prisma.user.findUnique({ where: { phone: ANONYMOUS_PHONE } });
  if (existing) {
    if (existing.status !== "disabled" || existing.name !== ANONYMOUS_NAME) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { status: "disabled", name: existing.name || ANONYMOUS_NAME },
      });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      phone: ANONYMOUS_PHONE,
      name: ANONYMOUS_NAME,
      locale: "ar",
      status: "disabled",
    },
  });
}

export async function findOrCreateGuestUser(opts: {
  name: string;
  identifier: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = opts.name.trim();
  if (!name) return { ok: false, error: "guest_name_required" };
  const detected = detectIdentifier(opts.identifier);
  if (!detected) return { ok: false, error: "invalid_identifier" };
  if (detected.phone && isAnonymousPhone(detected.phone)) {
    const anon = await ensureAnonymousUser();
    return { ok: true, id: anon.id };
  }

  let user = detected.email
    ? await prisma.user.findUnique({ where: { email: detected.email } })
    : await prisma.user.findUnique({ where: { phone: detected.phone } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        name,
        status: "invited",
        email: detected.email,
        phone: detected.phone,
      },
    });
  }

  return { ok: true, id: user.id };
}
