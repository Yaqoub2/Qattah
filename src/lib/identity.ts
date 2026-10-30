export const DEFAULT_PHONE_COUNTRY = "966";

const INDIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

export function westernDigits(raw: string) {
  return raw.replace(/[٠-٩۰-۹]/g, (d) => INDIC_DIGITS[d] ?? d);
}

function digitsOnly(raw: string) {
  return westernDigits(raw).replace(/[^\d+]/g, "");
}

export function normalizePhone(raw: string, defaultCountry = DEFAULT_PHONE_COUNTRY): string | null {
  let p = digitsOnly(raw);
  if (!p) return null;
  if (p.startsWith("00")) p = `+${p.slice(2)}`;

  if (!p.startsWith("+")) {
    if (p.startsWith("0") && p.length === 10) p = `+${defaultCountry}${p.slice(1)}`;
    else if (p.startsWith(defaultCountry)) p = `+${p}`;
    else if (p.length === 9) p = `+${defaultCountry}${p}`;
    else p = `+${p}`;
  }

  const cc = defaultCountry;
  if (p.startsWith(`+${cc}0`)) p = `+${cc}${p.slice(cc.length + 2)}`;

  const nsn = p.slice(1);
  if (!/^\d{8,15}$/.test(nsn)) return null;
  return `+${nsn}`;
}

export function nationalPhoneDigits(raw: string, defaultCountry = DEFAULT_PHONE_COUNTRY) {
  const canonical = normalizePhone(raw, defaultCountry);
  if (!canonical) return westernDigits(raw).replace(/[^\d]/g, "");
  const prefix = `+${defaultCountry}`;
  if (canonical.startsWith(prefix)) return canonical.slice(prefix.length);
  return canonical.slice(1);
}

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

export function detectIdentifier(raw: string): { phone?: string; email?: string } | null {
  const t = raw.trim();
  if (t.includes("@")) {
    const email = normalizeEmail(t);
    return email ? { email } : null;
  }
  const phone = normalizePhone(t);
  return phone ? { phone } : null;
}

export function splitIdentifierPreset(preset?: string): {
  mode: "phone" | "email";
  national: string;
  email: string;
} {
  const raw = preset?.trim() ?? "";
  if (!raw) return { mode: "phone", national: "", email: "" };
  if (raw.includes("@")) return { mode: "email", national: "", email: raw };
  return { mode: "phone", national: nationalPhoneDigits(raw), email: "" };
}
