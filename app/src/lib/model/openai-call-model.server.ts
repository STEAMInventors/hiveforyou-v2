import "server-only";

export {
  callModelFromEnv,
  callModelFromServerEnv,
  requireCallModelFromEnv,
  requireCallModelFromServerEnv,
} from "./call-model.server";

/** @deprecated Use callModelFromEnv */
export { callModelFromServerEnv as openAiCallModelFromEnv } from "./call-model.server";
