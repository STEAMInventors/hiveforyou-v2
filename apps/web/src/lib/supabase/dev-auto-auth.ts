import type { AuthError, SupabaseClient } from "@supabase/supabase-js";

function isMissingSessionGetUserError(error: AuthError): boolean {
  if (error.name === "AuthSessionMissingError") {
    return true;
  }
  return error.message.includes("Auth session missing");
}

function readDevAuthCredentials(): { email: string; password: string } | null {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }
  const email = process.env.HIVE_DEV_AUTH_EMAIL?.trim();
  const password = process.env.HIVE_DEV_AUTH_PASSWORD?.trim();
  if (!email || !password) {
    return null;
  }
  return { email, password };
}

/**
 * Development-only: establish a normal Supabase session via password sign-in when none exists.
 * Never runs outside NODE_ENV=development. Credentials stay server-side (not NEXT_PUBLIC_*).
 */
export async function ensureDevSupabaseSession(supabase: SupabaseClient): Promise<void> {
  const credentials = readDevAuthCredentials();
  if (!credentials) {
    return;
  }

  const { data: existing, error: existingError } = await supabase.auth.getUser();
  if (existing.user) {
    return;
  }
  if (existingError && !isMissingSessionGetUserError(existingError)) {
    console.error("[dev-auto-auth] getUser failed", { message: existingError.message });
    return;
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (signInError) {
    console.error("[dev-auto-auth] signInWithPassword failed", { message: signInError.message });
  }
}
