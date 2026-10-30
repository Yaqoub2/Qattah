import "server-only";
import type { MethodCardData } from "@/components/methods";
import type { MethodView } from "./queries";

/** DB rows -> card props, swapping the QR object path for its signed URL. */
export function toMethodCards(rows: MethodView[], urls: Map<string, string>): MethodCardData[] {
  return rows.map((m) => ({
    id: m.id,
    kind: m.kind,
    label: m.label,
    iban: m.iban,
    beneficiary: m.beneficiary,
    linkUrl: m.linkUrl,
    details: m.details,
    qrUrl: m.qrPath ? (urls.get(m.qrPath) ?? null) : null,
  }));
}
