import type { AuthError, SupabaseClient } from "@supabase/supabase-js";

function isMissingSessionGetUserError(error: AuthError): boolean {
  if (error.name === "AuthSessionMissingError") {
    return true;
  }
  return error.message.includes("Auth session missing");
}

type ImplicitSession = {
  email: string;
  password: string;
  logLabel: "dev-auto-auth" | "preview-auth";
};

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

function readDevAuthCredentials(): ImplicitSession | null {
  if (!isDevAutoAuthEnabled()) {
    return null;
  }
  const email = process.env.HIVE_DEV_AUTH_EMAIL?.trim();
  const password = process.env.HIVE_DEV_AUTH_PASSWORD?.trim();
  if (!email || !password) {
    return null;
  }
  return { email, password, logLabel: "dev-auto-auth" };
}

/**
 * Preview gate on: sign in as the fixed preview Supabase user (real auth user; RLS unchanged).
 * Independent of NODE_ENV. Runs on Vercel when HIVE_PREVIEW_PASSWORD is set.
 * Call only after the request has passed the HTTP Basic gate.
 */
function readPreviewAuthCredentials(): ImplicitSession | null {
  if (!process.env.HIVE_PREVIEW_PASSWORD?.trim()) {
    return null;
  }
  const email = process.env.HIVE_PREVIEW_AUTH_EMAIL?.trim();
  const password = process.env.HIVE_PREVIEW_AUTH_PASSWORD?.trim();
  if (!email || !password) {
    console.error("[preview-auth] preview user credentials are not set");
    return null;
  }
  return { email, password, logLabel: "preview-auth" };
}

function readImplicitSessionCredentials(): ImplicitSession | null {
  const preview = readPreviewAuthCredentials();
  if (process.env.HIVE_PREVIEW_PASSWORD?.trim()) {
    return preview;
  }
  return readDevAuthCredentials();
}

/**
 * Establish a normal Supabase session via password sign-in when none exists.
 * Development: HIVE_DEV_AUTO_AUTH=1 and NODE_ENV=development, never on Vercel.
 * Preview: HIVE_PREVIEW_PASSWORD set (after the basic gate) uses the preview user instead.
 * Credentials stay server-side (not NEXT_PUBLIC_*).
 */
export async function ensureDevSupabaseSession(supabase: SupabaseClient): Promise<void> {
  const credentials = readImplicitSessionCredentials();
  if (!credentials) {
    return;
  }

  const { data: existing, error: existingError } = await supabase.auth.getUser();
  if (existing.user) {
    return;
  }
  if (existingError && !isMissingSessionGetUserError(existingError)) {
    console.error(`[${credentials.logLabel}] getUser failed`, { message: existingError.message });
    return;
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (signInError) {
    console.error(`[${credentials.logLabel}] signInWithPassword failed`, {
      message: signInError.message,
    });
  }
}
