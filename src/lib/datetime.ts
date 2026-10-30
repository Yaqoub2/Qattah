export function toDatetimeLocalValue(d: Date | null | undefined): string {
  if (!d) return "";
  const shifted = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}
