import "server-only";

import { NextResponse } from "next/server";

import { listServerEnvConfigurationIssues } from "./server-env";

export function logServerMisconfigured(issues: string[]): void {
  if (issues.length === 0) {
    return;
  }
  console.error("[server] SERVER_MISCONFIGURED missing:", issues.join(", "));
}

/** When false, API responses omit missing variable names (logged server-side only). */
export function shouldExposeServerMisconfiguredDetails(
  source: Record<string, string | undefined> = process.env,
): boolean {
  const vercelEnv = source.VERCEL_ENV?.trim();
  if (vercelEnv === "production") {
    return false;
  }
  if (vercelEnv === "preview" || vercelEnv === "development") {
    return true;
  }
  return source.NODE_ENV?.trim() !== "production";
}

export function serverMisconfiguredResponse(
  source: Record<string, string | undefined> = process.env,
): NextResponse {
  const missing = listServerEnvConfigurationIssues(source);
  logServerMisconfigured(missing);
  const body: { error: string; message: string; missing?: string[] } = {
    error: "SERVER_MISCONFIGURED",
    message: "Server environment is incomplete.",
  };
  if (shouldExposeServerMisconfiguredDetails(source)) {
    body.missing = missing;
  }
  return NextResponse.json(body, { status: 503 });
}