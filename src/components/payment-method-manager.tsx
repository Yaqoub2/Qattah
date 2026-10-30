"use client";

import {
  addGroupPaymentMethod,
  addUserPaymentMethod,
  deleteUserPaymentMethod,
  updateGroupPaymentMethod,
  updateUserPaymentMethod,
} from "@/actions/methods";
import { SubmitButton } from "@/components/forms";
import { ServerFormAction } from "@/lib/utils";
import {
  missingTypes,
  PAYMENT_FIELD_TYPES,
  typesOnMethod,
  type PaymentFieldType,
  type PaymentMethodView,
} from "@/lib/payment-types";
import { Landmark, Link2, QrCode } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

const TYPE_ICON = {
  iban: Landmark,
  qr: QrCode,
  link: Link2,
};

function TypeFields({ type }: { type: PaymentFieldType }) {
  const t = useTranslations("payment");
  if (type === "iban") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-ink/50">{t("ibanHint")}</p>
        <label className="block space-y-1 text-sm">
          <span>{t("iban")}</span>
          <input name="iban" className="field" dir="ltr" required autoComplete="off" />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t("beneficiary")}</span>
          <input name="beneficiaryName" className="field" />
        </label>
      </div>
    );
  }
  if (type === "qr") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-ink/50">{t("qrHint")}</p>
        <label className="block space-y-1 text-sm">
          <span>{t("qr")}</span>
          <input name="qr" type="file" accept="image/*" className="field" required />
        </label>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink/50">{t("linkHint")}</p>
      <label className="block space-y-1 text-sm">
        <span>{t("link")}</span>
        <input name="linkUrl" className="field" dir="ltr" type="url" required />
      </label>
    </div>
  );
}

function TypePicker({
  value,
  onChange,
  options,
}: {
  value: PaymentFieldType;
  onChange: (v: PaymentFieldType) => void;
  options: PaymentFieldType[];
}) {
  const t = useTranslations("payment");
  return (
    <div className="space-y-1">
      <span className="text-sm text-ink/70">{t("type")}</span>
      <input type="hidden" name="type" value={value} />
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => {
          const Icon = TYPE_ICON[opt];
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium ${
                active ? "border-teal bg-teal/10 text-teal" : "border-line bg-white text-ink/70"
              }`}
            >
              <Icon size={18} />
              {t(opt)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PaymentMethodManager({
  methods,
  groupId,
}: {
  methods: PaymentMethodView[];
  groupId?: string;
}) {
  const t = useTranslations("payment");
  const tg = useTranslations("group");
  const [createType, setCreateType] = useState<PaymentFieldType>("iban");
  const [openId, setOpenId] = useState<string | null>(null);
  const [addTypeById, setAddTypeById] = useState<Record<string, PaymentFieldType>>({});

  const createAction = groupId ? addGroupPaymentMethod : addUserPaymentMethod;
  const updateAction = groupId ? updateGroupPaymentMethod : updateUserPaymentMethod;

  return (
    <div className="space-y-3">
      <form action={createAction as ServerFormAction} className="card space-y-4 p-4">
        {groupId && <input type="hidden" name="groupId" value={groupId} />}
        <h3 className="font-semibold">{t("addMethod")}</h3>
        <label className="block space-y-1 text-sm">
          <span>{t("label")}</span>
          <input name="label" className="field" required placeholder={t("labelHint")} />
        </label>
        <TypePicker value={createType} onChange={setCreateType} options={[...PAYMENT_FIELD_TYPES]} />
        <TypeFields type={createType} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isDefault" className="size-4 accent-teal" />
          {t("defaultMethod")}
        </label>
        <SubmitButton>{tg("save")}</SubmitButton>
      </form>

      {methods.length === 0 && <p className="px-1 text-sm text-ink/50">{t("emptyMethods")}</p>}

      {methods.map((m) => {
        const present = typesOnMethod(m);
        const missing = missingTypes(m);
        const open = openId === m.id;
        const addType = addTypeById[m.id] ?? missing[0] ?? "iban";
        return (
          <div key={m.id} className="card overflow-hidden">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 p-4 text-start"
              onClick={() => setOpenId(open ? null : m.id)}
            >
              <div>
                <div className="font-semibold">
                  {m.label}
                  {m.isDefault ? (
                    <span className="ms-2 rounded-full bg-teal/10 px-2 py-0.5 text-[11px] font-medium text-teal">
                      {t("defaultMethod")}
                    </span>
                  ) : null}
                </div>
                {m.ownerName ? <p className="mt-0.5 text-xs text-ink/50">{m.ownerName}</p> : null}
                <p className="mt-1 text-[11px] text-ink/45">{t("tapToOpen")}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {present.map((ty) => {
                    const Icon = TYPE_ICON[ty];
                    return (
                      <span
                        key={ty}
                        className="inline-flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 text-[11px]"
                      >
                        <Icon size={12} />
                        {t(ty)}
                      </span>
                    );
                  })}
                </div>
              </div>
              <span className="text-ink/30">{open ? "▴" : "▾"}</span>
            </button>

            {open && (
              <div className="space-y-3 border-t border-line bg-sand/40 p-4 text-sm">
                {m.iban && (
                  <div>
                    <div className="text-xs text-ink/50">{t("iban")}</div>
                    <div dir="ltr" className="font-medium tracking-wide">
                      {m.iban}
                    </div>
                    {m.beneficiaryName && <div className="text-ink/60">{m.beneficiaryName}</div>}
                  </div>
                )}
                {m.qrImageUrl && (
                  <div>
                    <div className="text-xs text-ink/50">{t("qr")}</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.qrImageUrl} alt="" className="mt-1 h-28 w-28 rounded-xl bg-white object-contain p-1" />
                  </div>
                )}
                {m.linkUrl && (
                  <div>
                    <div className="text-xs text-ink/50">{t("link")}</div>
                    <a className="break-all text-teal" href={m.linkUrl} dir="ltr">
                      {m.linkUrl}
                    </a>
                  </div>
                )}

                {missing.length > 0 && (
                  <form
                    action={updateAction as ServerFormAction}
                    className="space-y-3 rounded-xl border border-line bg-white p-3"
                  >
                    <input type="hidden" name="id" value={m.id} />
                    {groupId && <input type="hidden" name="groupId" value={groupId} />}
                    <div className="font-medium">{t("addField")}</div>
                    <TypePicker
                      value={addType}
                      onChange={(v) => setAddTypeById({ ...addTypeById, [m.id]: v })}
                      options={missing}
                    />
                    <TypeFields type={addType} />
                    <SubmitButton>{tg("save")}</SubmitButton>
                  </form>
                )}

                {!groupId && (
                  <form action={deleteUserPaymentMethod as ServerFormAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <button className="text-sm text-rose">{tg("remove")}</button>
                  </form>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
