import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

import { sanitizeOAuthNextPath } from "./oauth-redirect";

/** Starts Supabase Google OAuth. The browser returns to `/auth/callback` with a PKCE code. */
export async function signInWithGoogle(nextPath = "/"): Promise<void> {
  const supabase = createBrowserSupabaseClient();
  const next = sanitizeOAuthNextPath(nextPath);
  const redirectTo = new URL("/auth/callback", window.location.origin);
  redirectTo.searchParams.set("next", next);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo.toString(),
      queryParams: {
        prompt: "select_account",
      },
    },
  });
  if (error) {
    throw error;
  }
}
