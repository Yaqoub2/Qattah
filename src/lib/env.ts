export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL");
  return v;
}

/** New dashboard name is "publishable"; older projects still show "anon". */
export function supabasePublishableKey(): string {
  const v =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) {
    throw new Error(
      "Missing env NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    );
  }
  return v;
}

export function supabaseServiceRoleKey(): string {
  const v = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v || v === "your-service-role-key") {
    throw new Error("Missing env SUPABASE_SERVICE_ROLE_KEY");
  }
  return v;
}
