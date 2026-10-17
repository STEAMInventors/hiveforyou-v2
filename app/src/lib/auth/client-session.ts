"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export type ClientSessionStatus = "authenticated" | "unauthenticated" | "error";

export const WORKFLOW_SESSION_UNAVAILABLE_MESSAGE =
  "No authorized session is available. In local development, enable HIVE_DEV_AUTO_AUTH with HIVE_DEV_AUTH_EMAIL and HIVE_DEV_AUTH_PASSWORD, or sign in with a real Supabase session.";

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

/**
 * Resolves whether protected onboarding APIs may run.
 * Hits the server first so middleware/dev auto-auth can establish Supabase cookies,
 * then falls back to the browser session (and treats server-only auth as sufficient).
 */
export async function resolveWorkflowSessionStatus(): Promise<ClientSessionStatus> {
  try {
    const response = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    let serverAuthenticated = false;
    if (response.ok) {
      const body = (await response.json()) as { status?: string };
      serverAuthenticated = body.status === "authenticated";
    } else if (response.status !== 401) {
      return "error";
    }

    const browserStatus = await readClientSessionStatus();
    if (serverAuthenticated || browserStatus === "authenticated") {
      return "authenticated";
    }
    if (browserStatus === "error") {
      return "error";
    }
    return "unauthenticated";
  } catch {
    return "error";
  }
}