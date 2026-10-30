import "server-only";
import { ActionError } from "./guard";

/**
 * Supabase Storage over its REST API, private bucket.
 * The database stores object paths only; pages get short-lived signed URLs in one batch call.
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
const SIGNED_TTL_SECONDS = 60 * 60;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key, bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "qattah" };
}

export const storageEnabled = () => config() !== null;

/** A form File, or undefined when the input was left empty. */
export function fileOrUndefined(v: unknown): File | undefined {
  return v instanceof File && v.size > 0 ? v : undefined;
}

/** Uploads under `<folder>/<uuid>.<ext>` and returns the object path. */
export async function uploadFile(file: File, folder: string): Promise<string> {
  const c = config();
  if (!c) throw new ActionError("storage_not_configured");
  const ext = TYPES[file.type];
  if (!ext) throw new ActionError("unsupported_file");
  if (file.size > MAX_UPLOAD_BYTES) throw new ActionError("file_too_large");
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const res = await fetch(`${c.url}/storage/v1/object/${c.bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.key}`, "content-type": file.type, "x-upsert": "false" },
    body: Buffer.from(await file.arrayBuffer()),
  });
  if (!res.ok) throw new ActionError("upload_failed");
  return path;
}

/** Best effort: a leftover object is harmless, a failed DB write is not. */
export async function removeFiles(paths: (string | null | undefined)[]) {
  const c = config();
  const prefixes = paths.filter((p): p is string => Boolean(p));
  if (!c || prefixes.length === 0) return;
  await fetch(`${c.url}/storage/v1/object/${c.bucket}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${c.key}`, "content-type": "application/json" },
    body: JSON.stringify({ prefixes }),
  }).catch((e) => console.error("storage delete failed", e));
}

/** path -> signed URL, for every path on the page, in one request. */
export async function signedUrls(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const c = config();
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const out = new Map<string, string>();
  if (!c || unique.length === 0) return out;
  const res = await fetch(`${c.url}/storage/v1/object/sign/${c.bucket}`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.key}`, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: SIGNED_TTL_SECONDS, paths: unique }),
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return out;
  const rows = (await res.json()) as { path: string | null; signedURL: string | null }[];
  for (const r of rows) if (r.path && r.signedURL) out.set(r.path, `${c.url}/storage/v1${r.signedURL}`);
  return out;
}
