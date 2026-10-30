import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["+966 55 123 4567", "+966551234567"],
    ["00966551234567", "+966551234567"],
    ["0551234567", "+966551234567"],
    ["551234567", "+966551234567"],
    ["966551234567", "+966551234567"],
    ["٠٥٥١٢٣٤٥٦٧", "+966551234567"],
    ["+1 (415) 555-0100", "+14155550100"],
  ])("%s -> %s", (raw, out) => expect(normalizePhone(raw)).toBe(out));

  it.each(["", "abc", "+0123", "12", "you@example.com"])("rejects %s", (raw) => expect(normalizePhone(raw)).toBeNull());
});
