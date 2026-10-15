import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

import {
  authorizationMatchesPreviewPassword,
  isPreviewPasswordGateEnabled,
} from "@/lib/preview/preview-gate";
import { readServerEnv } from "@/lib/env/server-env";
import { createSupabaseHiveGateway, type HiveGateway } from "@/lib/persistence/hive-gateway";

import { createAdminSupabaseClient } from "./admin";
import {
  ControlledTestAuthMisconfiguredError,
  requireControlledTestOwnerUserId,
  usesControlledTestAuthentication,
} from "./controlled-test-mode";
import { ensureDevSupabaseSession } from "./dev-auto-auth";

export { ControlledTestAuthMisconfiguredError };

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
    if (usesControlledTestAuthentication()) {
      return requireControlledTestOwnerUserId();
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

/** Session client for normal auth; service-role client when controlled-test mode is active. */
export async function createAuthenticatedSupabaseClient(): Promise<SupabaseClient> {
  if (usesControlledTestAuthentication()) {
    readServerEnv();
    return createAdminSupabaseClient();
  }
  return createServerSupabaseClient();
}

/** Trusted persistence gateway for the authenticated workflow owner. */
export async function createAuthenticatedHiveGateway(): Promise<HiveGateway> {
  const client = await createAuthenticatedSupabaseClient();
  return createSupabaseHiveGateway(client);
}
