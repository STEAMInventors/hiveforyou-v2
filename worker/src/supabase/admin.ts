import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { WorkerEnv } from "../env.js";

export function createWorkerAdminSupabase(env: WorkerEnv): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function countCasesForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    throw error;
  }
  return count ?? 0;
}
