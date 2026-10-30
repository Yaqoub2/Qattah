import "server-only";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { z } from "zod";
import { parseMajorInput } from "@/lib/money";
import { ActionError } from "./guard";
import { fileOrUndefined, removeFiles, uploadFile } from "./storage";

export type FormState = { error?: string; ok?: boolean };

/**
 * Wraps a server action for useActionState: validates FormData with zod,
 * maps known failures to an error key (translated in the UI), and refreshes the page data.
 */
export function formAction<S extends z.ZodType>(schema: S, run: (input: z.infer<S>) => Promise<void>) {
  return async (_prev: FormState, fd: FormData): Promise<FormState> => {
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return { error: "invalid_input" };
    try {
      await run(parsed.data);
    } catch (e) {
      if (isRedirectError(e)) throw e;
      if (e instanceof ActionError) return { error: e.message };
      const guard = e instanceof Error && /\b(activity_closed|expense_sealed)\b/.exec(e.message);
      if (guard) return { error: guard[1] };
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") return { error: "already_exists" };
        if (e.code === "P2003") return { error: "in_use" };
      }
      console.error(e);
      return { error: "server_error" };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  };
}

const blankToUndef = (v: unknown) => (v === "" || v == null ? undefined : v);

export const f = {
  id: z.string().uuid(),
  text: (max = 120) => z.string().trim().min(1).max(max),
  optionalText: (max = 300) => z.preprocess(blankToUndef, z.string().trim().max(max).optional()),
  optionalId: z.preprocess(blankToUndef, z.string().uuid().optional()),
  date: z.preprocess(blankToUndef, z.coerce.date().optional()),
  checkbox: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  money: z.string().trim().regex(/^\d+([.,]\d{1,3})?$/),
  splitMethod: z.preprocess(blankToUndef, z.enum(["amount", "shares", "percentage"]).optional()),
  splitValue: z.preprocess(blankToUndef, z.string().trim().regex(/^\d+([.,]\d{1,4})?$/).optional()),
  file: z.preprocess(fileOrUndefined, z.instanceof(File).optional()),
};

/** Uploads first, then writes; removes the object again if the write fails. */
export async function withUpload<T>(file: File | undefined, folder: string, write: (path: string | null) => Promise<T>) {
  const path = file ? await uploadFile(file, folder) : null;
  try {
    return await write(path);
  } catch (e) {
    await removeFiles([path]);
    throw e;
  }
}

export function toMinorOrThrow(raw: string, currency: string) {
  const v = parseMajorInput(raw, currency);
  if (v == null || v <= 0) throw new ActionError("invalid_amount");
  return v;
}

/** Form method/value -> DB columns. Amounts are stored in minor units. Both empty = no rule. */
export function toSplitColumns(method: string | undefined, value: string | undefined, currency: string) {
  if (!method && !value) return { splitMethod: null, splitValue: null };
  if (!method || !value) throw new ActionError("invalid_split");
  const n = Number(value.replace(",", "."));
  if (method === "amount") {
    const minor = parseMajorInput(value, currency);
    if (minor == null) throw new ActionError("invalid_split");
    return { splitMethod: "amount" as const, splitValue: new Prisma.Decimal(minor) };
  }
  if (method === "percentage" && (n <= 0 || n > 100)) throw new ActionError("invalid_split");
  if (method === "shares" && n <= 0) throw new ActionError("invalid_split");
  return { splitMethod: method as "shares" | "percentage", splitValue: new Prisma.Decimal(n) };
}
