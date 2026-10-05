import "server-only";

export { callModelFromEnv, requireCallModelFromEnv } from "./call-model.server";

/** @deprecated Use callModelFromEnv */
export { callModelFromEnv as openAiCallModelFromEnv } from "./call-model.server";
