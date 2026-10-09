import { createServer } from "node:http";

import { assertWorkerStartPolicy, readWorkerEnv } from "./env.js";
import { startHeartbeat } from "./heartbeat.js";
import { runBootCheckIfRequested } from "./boot-check.js";
import { runSelfCheckIfRequested } from "./self-check.js";
import { createWorkerAdminSupabase } from "./supabase/admin.js";
import { startVerifierServerIfConfigured } from "./verifier/server.js";

async function startConnect(): Promise<void> {
  const { connect } = await import("inngest/connect");
  const { inngest } = await import("./inngest/client.js");
  const { workerFunctions } = await import("./inngest/functions/index.js");

  const connection = await connect({
    apps: [{ client: inngest, functions: workerFunctions }],
    handleShutdownSignals: ["SIGINT", "SIGTERM"],
  });

  console.info("[worker] connect mode ready", { state: connection.state });

  await connection.closed;
  console.info("[worker] connect closed");
}

async function startServe(): Promise<void> {
  const { serve } = await import("inngest/node");
  const { inngest } = await import("./inngest/client.js");
  const { workerFunctions } = await import("./inngest/functions/index.js");

  const env = readWorkerEnv();
  const inngestHandler = serve({ client: inngest, functions: workerFunctions });
  const server = createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "";
    if (path === "/api/inngest" || path.startsWith("/api/inngest/")) {
      void inngestHandler(req, res);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(env.HIVE_WORKER_SERVE_PORT, () => {
      console.info("[worker] serve mode listening", {
        port: env.HIVE_WORKER_SERVE_PORT,
        path: "/api/inngest",
      });
      resolve();
    });
  });

  const shutdown = (signal: string) => {
    console.info("[worker] shutting down", { signal });
    server.close(() => {
      process.exit(0);
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

async function main(): Promise<void> {
  if (await runSelfCheckIfRequested(process.argv)) {
    return;
  }
  if (await runBootCheckIfRequested(process.argv)) {
    return;
  }
  assertWorkerStartPolicy();
  const env = readWorkerEnv();
  startHeartbeat();
  const supabase = createWorkerAdminSupabase(env);
  await startVerifierServerIfConfigured(supabase, env);
  if (env.HIVE_WORKER_MODE === "serve") {
    await startServe();
    return;
  }
  await startConnect();
}

main().catch((error: unknown) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
