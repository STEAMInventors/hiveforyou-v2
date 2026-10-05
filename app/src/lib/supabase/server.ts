import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import {
  authorizationMatchesPreviewPassword,
  isPreviewPasswordGateEnabled,
} from "@/lib/preview/preview-gate";
import { readServerEnv } from "@/lib/env/server-env";

import { ensureDevSupabaseSession } from "./dev-auto-auth";

export async function createServerSupabaseClient() {
  const env = readServerEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: Parameters<typeof cookieStore.set>[2] }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot always write cookies. Route handlers can.
        }
      },
    },
  });
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  if (isPreviewPasswordGateEnabled()) {
    const headerList = await headers();
    if (!authorizationMatchesPreviewPassword(headerList.get("authorization"))) {
      return null;
    }
  }
  const supabase = await createServerSupabaseClient();
  await ensureDevSupabaseSession(supabase);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user.id;
}
