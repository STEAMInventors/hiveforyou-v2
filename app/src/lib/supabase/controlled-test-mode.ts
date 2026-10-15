import "server-only";

import { isPreviewPasswordGateEnabled } from "@/lib/preview/preview-gate";

/** Explicit opt-in for preview-gated workflows without Supabase email/password sign-in. */
export function isControlledTestModeEnabled(
  source: Record<string, string | undefined> = process.env,
): boolean {
  const flag = source.HIVE_CONTROLLED_TEST_MODE?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

/** Controlled test auth applies only when the preview gate and explicit flag are both enabled. */
export function usesControlledTestAuthentication(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return isControlledTestModeEnabled(source) && isPreviewPasswordGateEnabled(source);
}

export function readControlledTestOwnerUserId(
  source: Record<string, string | undefined> = process.env,
): string | null {
  const ownerId = source.HIVE_TEST_OWNER_USER_ID?.trim();
  return ownerId || null;
}

export class ControlledTestAuthMisconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlledTestAuthMisconfiguredError";
  }
}

/** Fail closed when controlled-test mode is active but owner or service-role config is missing. */
export function requireControlledTestOwnerUserId(
  source: Record<string, string | undefined> = process.env,
): string {
  if (!usesControlledTestAuthentication(source)) {
    throw new ControlledTestAuthMisconfiguredError(
      "Controlled test authentication is not active.",
    );
  }
  const ownerId = readControlledTestOwnerUserId(source);
  if (!ownerId) {
    throw new ControlledTestAuthMisconfiguredError("HIVE_TEST_OWNER_USER_ID is not configured.");
  }
  if (!source.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new ControlledTestAuthMisconfiguredError("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return ownerId;
}
