"use server";

import { z } from "zod";
import { prisma } from "@/server/db";
import { actionMember, actionUser, ActionError } from "@/server/guard";
import { f, formAction, withUpload } from "@/server/action";
import { removeFiles } from "@/server/storage";

const methodInput = z.object({
  groupId: f.optionalId,
  kind: z.enum(["bank", "link", "qr", "other"]),
  label: f.text(60),
  iban: f.optionalText(40),
  beneficiary: f.optionalText(80),
  linkUrl: f.optionalText(300),
  details: f.optionalText(300),
  qr: f.file,
});

/** Keeps only the fields that belong to the kind, so a row never carries stale data. */
function fieldsFor(input: z.infer<typeof methodInput>) {
  const details = input.details ?? null;
  if (input.kind === "bank") {
    const iban = input.iban?.replace(/\s+/g, "").toUpperCase();
    if (!iban || !/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban)) throw new ActionError("invalid_iban");
    return { iban, beneficiary: input.beneficiary ?? null, details };
  }
  if (input.kind === "link") {
    const url = URL.canParse(input.linkUrl ?? "") ? new URL(input.linkUrl!) : null;
    if (!url || url.protocol !== "https:") throw new ActionError("invalid_link");
    return { linkUrl: url.toString(), details };
  }
  if (input.kind === "other" && !details) throw new ActionError("invalid_input");
  return { details };
}

/** With groupId (admin): the group's account. Without: the signed-in user's own account. One INSERT. */
export const addMethod = formAction(methodInput, async (input) => {
  const owner = input.groupId
    ? (await actionMember(input.groupId, { admin: true }), { groupId: input.groupId })
    : { userId: (await actionUser()).id };
  const fields = fieldsFor(input);
  if (input.kind === "qr" && !input.qr) throw new ActionError("qr_required");
  const folder = input.groupId ? `groups/${input.groupId}/methods` : `users/${owner.userId}/methods`;
  await withUpload(input.kind === "qr" ? input.qr : undefined, folder, (qrPath) =>
    prisma.paymentMethod.create({ data: { ...owner, kind: input.kind, label: input.label, qrPath, ...fields } }),
  );
});

/** DELETE ... RETURNING, scoped to the owner; then removes the QR image. */
export const deleteMethod = formAction(z.object({ id: f.id, groupId: f.optionalId }), async ({ id, groupId }) => {
  const owner = groupId
    ? (await actionMember(groupId, { admin: true }), { groupId })
    : { userId: (await actionUser()).id };
  const row = await prisma.paymentMethod.findFirst({ where: { id, ...owner }, select: { qrPath: true } });
  if (!row) throw new ActionError("not_allowed");
  await prisma.paymentMethod.delete({ where: { id } });
  await removeFiles([row.qrPath]);
});
