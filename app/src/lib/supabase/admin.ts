import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readServerEnv } from "@/lib/env/server-env";

/**
 * Service-role client. Do not use this for case, document, or study access.
 * Those paths use the authenticated user client so RLS applies.
 */
export function createAdminSupabaseClient() {
  const env = readServerEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
