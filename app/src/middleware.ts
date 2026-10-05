import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  authorizationMatchesPreviewPassword,
  isPreviewPasswordGateEnabled,
} from "@/lib/preview/preview-gate";
import { ensureDevSupabaseSession } from "@/lib/supabase/dev-auto-auth";

const PREVIEW_AUTHENTICATE = 'Basic realm="Hive preview", charset="UTF-8"';

export async function middleware(request: NextRequest) {
  if (
    isPreviewPasswordGateEnabled() &&
    !authorizationMatchesPreviewPassword(request.headers.get("authorization"))
  ) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": PREVIEW_AUTHENTICATE },
    });
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: Record<string, unknown>;
        }[],
      ) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();
  await ensureDevSupabaseSession(supabase);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
