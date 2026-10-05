import "server-only";

import { createCallModelFromEnv } from "@hiveforyou/model-providers/env";
import type { CallModel } from "@hiveforyou/core";

/** Returns a CallModel when the selected provider's API key is configured; otherwise undefined. */
export function callModelFromEnv(
  source: Record<string, string | undefined> = process.env,
): CallModel | undefined {
  const provider = source.MODEL_PROVIDER?.trim().toLowerCase() ?? "openai";
  const hasKey =
    provider === "anthropic"
      ? Boolean(source.ANTHROPIC_API_KEY?.trim())
      : Boolean(source.OPENAI_API_KEY?.trim());
  if (!hasKey) {
    return undefined;
  }
  return createCallModelFromEnv(source).callModel;
}

/** Fail-closed when the selected provider's API key is missing. */
export function requireCallModelFromEnv(
  source: Record<string, string | undefined> = process.env,
): CallModel {
  return createCallModelFromEnv(source).callModel;
}
