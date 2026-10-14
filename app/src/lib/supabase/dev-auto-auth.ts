import type { AuthError, SupabaseClient } from "@supabase/supabase-js";

import { assertAuthBypassDisabledInProduction } from "@/lib/preview/preview-gate";

function isMissingSessionGetUserError(error: AuthError): boolean {
  if (error.name === "AuthSessionMissingError") {
    return true;
  }
  return error.message.includes("Auth session missing");
}

function isDevAutoAuthEnabled(): boolean {
  if (process.env.NODE_ENV !== "development") {
    return false;
  }
  if (process.env.VERCEL === "1") {
    return false;
  }
  const optIn = process.env.HIVE_DEV_AUTO_AUTH?.trim().toLowerCase();
  return optIn === "1" || optIn === "true";
}

function readDevAuthCredentials(): { email: string; password: string } | null {
  if (!isDevAutoAuthEnabled()) {
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
 * Local development only: establish a Supabase session via password sign-in when none exists.
 * Requires HIVE_DEV_AUTO_AUTH=1, NODE_ENV=development, and is never active on Vercel.
 * The HTTP Basic preview gate does not sign in a user.
 * Credentials stay server-side (not NEXT_PUBLIC_*).
 */
export async function ensureDevSupabaseSession(supabase: SupabaseClient): Promise<void> {
  assertAuthBypassDisabledInProduction();
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
    console.error("[dev-auto-auth] signInWithPassword failed", {
      message: signInError.message,
    });
  }
}
