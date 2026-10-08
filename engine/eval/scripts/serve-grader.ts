/**
 * Local eval grader HTTP transport (127.0.0.1 only). Requires HIVE_EVAL_TOKEN.
 *
 *   pnpm --filter @hiveforyou/eval eval:serve
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { requireEvalToken, resolveEvalPort } from "../src/server/env.js";
import {
  closeGraderServer,
  createGraderServer,
  listenGraderServer,
} from "../src/server/grader-server.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const evalRoot = resolve(scriptDir, "..");
const repoRoot = resolve(evalRoot, "../..");

async function main(): Promise<void> {
  const token = requireEvalToken();
  const port = resolveEvalPort();
  const server = createGraderServer({ token, repoRoot, evalRoot });
  await listenGraderServer(server, { host: "127.0.0.1", port });
  console.info(`Hive eval grader listening on http://127.0.0.1:${port}`);

  const shutdown = (signal: string) => {
    console.info("[eval-grader] shutting down", { signal });
    void closeGraderServer(server).then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("[eval-grader] fatal", error);
  process.exit(1);
});
