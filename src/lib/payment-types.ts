export const PAYMENT_FIELD_TYPES = ["iban", "qr", "link"] as const;
export type PaymentFieldType = (typeof PAYMENT_FIELD_TYPES)[number];

export type PaymentMethodView = {
  id: string;
  type: string;
  label: string;
  iban: string | null;
  beneficiaryName: string | null;
  qrImageUrl: string | null;
  linkUrl: string | null;
  details: string | null;
  isDefault: boolean;
  ownerName?: string | null;
};

export function typesOnMethod(m: {
  type: string;
  iban?: string | null;
  qrImageUrl?: string | null;
  linkUrl?: string | null;
}): PaymentFieldType[] {
  const set = new Set<PaymentFieldType>();
  for (const part of m.type.split(",")) {
    const t = part.trim();
    if (t === "iban" || t === "qr" || t === "link") set.add(t);
  }
  if (m.iban) set.add("iban");
  if (m.qrImageUrl) set.add("qr");
  if (m.linkUrl) set.add("link");
  return PAYMENT_FIELD_TYPES.filter((t) => set.has(t));
}

export function missingTypes(m: PaymentMethodView): PaymentFieldType[] {
  const have = new Set(typesOnMethod(m));
  return PAYMENT_FIELD_TYPES.filter((t) => !have.has(t));
}

export function mergeTypeList(existing: string, added: string): string {
  const set = new Set(
    existing
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  set.add(added);
  return [...set].join(",");
}
