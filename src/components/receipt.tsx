import { getTranslations } from "next-intl/server";
import { Field } from "./forms";

/** Opens a signed receipt URL (valid for one hour). */
export async function ReceiptLink({ url }: { url: string }) {
  const t = await getTranslations("receipt");
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-teal underline">
      {t("view")}
    </a>
  );
}

/** Optional receipt picker; hidden when storage is not configured. */
export async function ReceiptInput({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  const t = await getTranslations("receipt");
  return <Field label={t("attach")} name="receipt" type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" />;
}
