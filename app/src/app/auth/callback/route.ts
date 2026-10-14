import { NextResponse } from "next/server";

import { sanitizeOAuthNextPath } from "@/lib/auth/oauth-redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Completes Supabase Google OAuth (PKCE). Session cookies are written by the server client.
 * Does not sign in a shared or preview user.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const next = sanitizeOAuthNextPath(url.searchParams.get("next"));
  const failure = new URL("/?auth=error", url.origin);

  if (!code) {
    return NextResponse.redirect(failure);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(failure);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
