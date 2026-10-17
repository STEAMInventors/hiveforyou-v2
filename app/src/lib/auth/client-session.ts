"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export type ClientSessionStatus = "authenticated" | "unauthenticated" | "error";

/** Reads the current Supabase browser session without creating or mutating auth state. */
export async function readClientSessionStatus(): Promise<ClientSessionStatus> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return "unauthenticated";
    }
    return "authenticated";
  } catch {
    return "error";
  }
}