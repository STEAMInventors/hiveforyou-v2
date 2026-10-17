import { NextResponse } from "next/server";

import { serverMisconfiguredResponse } from "@/lib/env/server-misconfigured";
import { readServerEnv } from "@/lib/env/server-env";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export type AuthSessionResponse =
  | { status: "authenticated" }
  | { status: "unauthenticated" };

/** Lets the client discover server-side auth (dev auto-auth, preview user, controlled test). */
export async function GET() {
  try {
    readServerEnv();
  } catch {
    return serverMisconfiguredResponse();
  }

  const sessionUserId = await getAuthenticatedUserId();
  const body: AuthSessionResponse = sessionUserId
    ? { status: "authenticated" }
    : { status: "unauthenticated" };
  return NextResponse.json(body, { status: sessionUserId ? 200 : 401 });
}