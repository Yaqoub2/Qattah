import { getTranslations } from "next-intl/server";

export default async function Loading() {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 px-4">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-teal/25 border-t-teal" />
      <p className="text-sm text-ink/55">{t("loading")}</p>
    </div>
  );
}
