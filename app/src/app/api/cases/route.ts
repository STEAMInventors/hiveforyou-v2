import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";

import { serverMisconfiguredResponse } from "@/lib/env/server-misconfigured";
import { readServerEnv } from "@/lib/env/server-env";
import { listOwnedHivesForSession } from "@/lib/cases/owned-hives-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    readServerEnv();
  } catch {
    return serverMisconfiguredResponse();
  }

  try {
    const payload = await listOwnedHivesForSession();
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in is required." },
        { status: 401 },
      );
    }
    if (process.env.NODE_ENV === "development") {
      console.error("[api/cases] UNEXPECTED", error);
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Could not load your Hives." },
      { status: 500 },
    );
  }
}
