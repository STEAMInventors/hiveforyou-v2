import "server-only";

import { NextResponse } from "next/server";

import {
  listServerEnvConfigurationIssues,
  readServerRequiredEnvDiagnostics,
} from "./server-env";

export function logServerMisconfigured(
  issues: string[],
  source: Record<string, string | undefined> = process.env,
): void {
  if (issues.length === 0) {
    return;
  }
  const vercelEnv = source.VERCEL_ENV;
  const deploymentId = source.VERCEL_DEPLOYMENT_ID;
  console.error("[server] SERVER_MISCONFIGURED", {
    missing: issues,
    required: readServerRequiredEnvDiagnostics(source),
    VERCEL_ENV: typeof vercelEnv === "string" ? vercelEnv.trim() || null : null,
    VERCEL_DEPLOYMENT_ID:
      typeof deploymentId === "string" ? deploymentId.trim() || null : null,
  });
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
  logServerMisconfigured(missing, source);
  const body: { error: string; message: string; missing?: string[] } = {
    error: "SERVER_MISCONFIGURED",
    message: "Server environment is incomplete.",
  };
  if (shouldExposeServerMisconfiguredDetails(source)) {
    body.missing = missing;
  }
  return NextResponse.json(body, { status: 503 });
}