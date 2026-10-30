import { requirePageUser } from "@/lib/page-auth";
import { Brand, BottomNav } from "@/components/shell";
import { Field, SubmitButton } from "@/components/forms";
import { createGroup } from "@/actions/groups";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { getLocale } from "next-intl/server";

export default async function NewGroupPage() {
  await requirePageUser();
  const t = await getTranslations("group");
  const locale = await getLocale();

  async function action(formData: FormData) {
    "use server";
    const res = await createGroup(formData);
    if (res.ok && res.id) {
      redirect({ href: `/groups/${res.id}`, locale });
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5">
      <Brand />
      <h1 className="mt-8 text-2xl font-bold">{t("createTitle")}</h1>
      <form action={action} className="card mt-6 space-y-4 p-5">
        <Field name="name" label={t("name")} required />
        <label className="block space-y-1 text-sm">
          <span className="text-ink/70">{t("currency")}</span>
          <select name="currency" className="field" defaultValue="SAR">
            {["SAR", "AED", "KWD", "QAR", "BHD", "OMR", "USD", "EUR"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-ink/70">{t("defaultSplit")}</span>
          <select name="defaultSplitMethod" className="field" defaultValue="equal">
            <option value="equal">{t("equal")}</option>
            <option value="shares">{t("shares")}</option>
            <option value="percentage">{t("percentage")}</option>
            <option value="amount">{t("amount")}</option>
          </select>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="membersCanSubmit" defaultChecked className="mt-1" />
          {t("membersCanSubmit")}
        </label>
        <SubmitButton>{t("save")}</SubmitButton>
      </form>
      <BottomNav />
    </div>
  );
}
