export function formatDateTime(value: Date | string | null | undefined, locale: string) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
