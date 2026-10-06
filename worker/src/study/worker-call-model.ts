import { createCallModelFromEnv } from "@hiveforyou/model-providers/env";
import type { CallModel } from "@hiveforyou/core";

function envRecord(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return env;
}

export function createWorkerCallModel(
  env: Record<string, string | undefined>,
): { callModel: CallModel; modelName: string } | null {
  try {
    const bundle = createCallModelFromEnv(envRecord(env));
    return { callModel: bundle.callModel, modelName: bundle.modelName };
  } catch {
    return null;
  }
}
