import { describe, expect, it } from "vitest";
import { detectIdentifier, nationalPhoneDigits, normalizePhone, splitIdentifierPreset } from "./identity";

describe("normalizePhone", () => {
  it("canonicalizes Saudi local numbers to +966", () => {
    expect(normalizePhone("0512345678")).toBe("+966512345678");
    expect(normalizePhone("512345678")).toBe("+966512345678");
    expect(normalizePhone("966512345678")).toBe("+966512345678");
    expect(normalizePhone("+966512345678")).toBe("+966512345678");
    expect(normalizePhone("00966512345678")).toBe("+966512345678");
    expect(normalizePhone("+966 51 234 5678")).toBe("+966512345678");
    expect(normalizePhone("+9660512345678")).toBe("+966512345678");
  });

  it("accepts Arabic-Indic digits", () => {
    expect(normalizePhone("٠٥١٢٣٤٥٦٧٨")).toBe("+966512345678");
  });

  it("keeps other country codes", () => {
    expect(normalizePhone("+971501234567")).toBe("+971501234567");
  });

  it("accepts the anonymous sentinel phone", () => {
    expect(normalizePhone("+000000000000")).toBe("+000000000000");
    expect(detectIdentifier("+000000000000")).toEqual({ phone: "+000000000000" });
  });

  it("rejects short or empty values", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("detectIdentifier", () => {
  it("detects email vs phone", () => {
    expect(detectIdentifier("a@b.com")).toEqual({ email: "a@b.com" });
    expect(detectIdentifier("512345678")).toEqual({ phone: "+966512345678" });
  });
});

describe("nationalPhoneDigits", () => {
  it("strips the default country prefix", () => {
    expect(nationalPhoneDigits("+966512345678")).toBe("512345678");
    expect(nationalPhoneDigits("0512345678")).toBe("512345678");
  });
});

describe("splitIdentifierPreset", () => {
  it("defaults to Saudi phone", () => {
    expect(splitIdentifierPreset()).toEqual({ mode: "phone", national: "", email: "" });
    expect(splitIdentifierPreset("+966512345678")).toEqual({
      mode: "phone",
      national: "512345678",
      email: "",
    });
  });

  it("detects email presets", () => {
    expect(splitIdentifierPreset("a@b.com")).toEqual({ mode: "email", national: "", email: "a@b.com" });
  });
});
