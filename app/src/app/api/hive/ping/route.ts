import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { UnauthenticatedError, requireSessionUserId } from "@hiveforyou/core";
import {
  HIVE_EVENT_PING,
  hivePingEventDataSchema,
} from "@hiveforyou/shared/events";

import { inngest } from "@/lib/inngest/client";
import { serverMisconfiguredResponse } from "@/lib/env/server-misconfigured";
import { readServerEnv } from "@/lib/env/server-env";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    readServerEnv();
  } catch {
    return serverMisconfiguredResponse();
  }

  let bodyUserId: string | undefined;
  try {
    const body = (await request.json()) as { userId?: string };
    bodyUserId = body.userId;
  } catch {
    bodyUserId = undefined;
  }

  if (bodyUserId !== undefined && process.env.NODE_ENV === "development") {
    console.info("[api/hive/ping] ignoring body userId");
  }

  try {
    const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
    const eventId = randomUUID();
    const nonce = randomUUID();
    const data = hivePingEventDataSchema.parse({
      userId: sessionUserId,
      nonce,
    });

    await inngest.send({
      id: eventId,
      name: HIVE_EVENT_PING,
      data,
    });

    return NextResponse.json({ eventId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in is required." },
        { status: 401 },
      );
    }
    if (process.env.NODE_ENV === "development") {
      console.error("[api/hive/ping] UNEXPECTED", error);
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Ping could not be sent." },
      { status: 500 },
    );
  }
}
