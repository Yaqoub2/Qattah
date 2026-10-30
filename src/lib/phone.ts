/** Country code used when someone types a local number (05xxxxxxxx / 5xxxxxxxx). */
export const DEFAULT_COUNTRY_CODE = "966";

/**
 * Normalises to E.164 ("+9665XXXXXXXX"). Accepts +, 00, local 0-prefixed and bare numbers,
 * with spaces, dashes or Arabic-Indic digits. Returns null when it can't be a phone number.
 */
export function normalizePhone(raw: string): string | null {
  const ascii = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const compact = ascii.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;

  let digits: string;
  if (compact.startsWith("+")) digits = compact.slice(1);
  else if (compact.startsWith("00")) digits = compact.slice(2);
  else if (compact.startsWith("0")) digits = DEFAULT_COUNTRY_CODE + compact.slice(1);
  else if (compact.length <= 9) digits = DEFAULT_COUNTRY_CODE + compact;
  else digits = compact;

  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}
