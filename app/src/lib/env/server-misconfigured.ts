import "server-only";

import { NextResponse } from "next/server";

import { listServerEnvConfigurationIssues } from "./server-env";

export function logServerMisconfigured(issues: string[]): void {
  if (issues.length === 0) {
    return;
  }
  console.error("[server] SERVER_MISCONFIGURED missing:", issues.join(", "));
}

export function serverMisconfiguredResponse(
  source: Record<string, string | undefined> = process.env,
): NextResponse {
  const missing = listServerEnvConfigurationIssues(source);
  logServerMisconfigured(missing);
  return NextResponse.json(
    {
      error: "SERVER_MISCONFIGURED",
      message: "Server environment is incomplete.",
      missing,
    },
    { status: 500 },
  );
}