import { verifyReaderExperimentPromptHashesPackaged } from "@hiveforyou/core/study";

import { runSelfCheck } from "./self-check.js";

/** Load Inngest client + worker functions like startup, without connect/serve. */
export async function runBootCheck(): Promise<void> {
  await runSelfCheck();
  verifyReaderExperimentPromptHashesPackaged();
  await import("inngest/connect");
  const { inngest } = await import("./inngest/client.js");
  const { workerFunctions } = await import("./inngest/functions/index.js");
  if (!inngest || workerFunctions.length === 0) {
    throw new Error("WORKER_BOOT_CHECK_INNGEST_INCOMPLETE");
  }
}

export function isBootCheckArgv(argv: string[]): boolean {
  return argv.includes("--boot-check");
}

export async function runBootCheckIfRequested(argv: string[]): Promise<boolean> {
  if (!isBootCheckArgv(argv)) {
    return false;
  }
  await runBootCheck();
  console.info("[worker] boot-check ok");
  return true;
}
