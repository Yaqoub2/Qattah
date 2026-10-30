import { createClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "./env";

export function supabaseAdmin() {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function uploadPublicFile(input: {
  bucket?: string;
  path: string;
  bytes: Buffer;
  contentType: string;
}): Promise<string> {
  if (!ALLOWED.has(input.contentType)) {
    throw new Error("unsupported_file_type");
  }
  if (input.bytes.length > MAX_BYTES) {
    throw new Error("file_too_large");
  }
  const bucket = input.bucket ?? process.env.SUPABASE_STORAGE_BUCKET ?? "qattah";
  const client = supabaseAdmin();
  const { error } = await client.storage.from(bucket).upload(input.path, input.bytes, {
    contentType: input.contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = client.storage.from(bucket).getPublicUrl(input.path);
  return data.publicUrl;
}

export async function fileFromForm(file: File): Promise<{ bytes: Buffer; contentType: string }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return { bytes, contentType: file.type || "application/octet-stream" };
}
