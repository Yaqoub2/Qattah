const MINOR_DIGITS: Record<string, number> = {
  SAR: 2,
  USD: 2,
  EUR: 2,
  AED: 2,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  QAR: 2,
  EGP: 2,
  GBP: 2,
};

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

export function toMinor(major: number, currency: string): number {
  const d = minorDigits(currency);
  return Math.round(major * 10 ** d);
}

export function fromMinor(minor: number, currency: string): number {
  const d = minorDigits(currency);
  return minor / 10 ** d;
}

export function formatMoney(
  minor: number,
  currency: string,
  locale: string = "ar",
): string {
  const d = minorDigits(currency);
  const value = minor / 10 ** d;
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(value);
  } catch {
    return `${value.toFixed(d)} ${currency}`;
  }
}

export function parseMajorInput(raw: string, currency: string): number | null {
  const normalized = raw.replace(/,/g, ".").trim();
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return toMinor(n, currency);
}
