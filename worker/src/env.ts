export type WorkerEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  HIVE_STORAGE_BUCKET: string;
  HIVE_WORKER_MODE: "connect" | "serve";
  HIVE_WORKER_SERVE_PORT: number;
  /** Dev-only: `extract-once` fails the first extract step once per document id. */
  HIVE_FAULT_INJECT?: "extract-once";
};

export function readWorkerEnv(
  source: Record<string, string | undefined> = process.env,
): WorkerEnv {
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = source.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const storageBucket = source.HIVE_STORAGE_BUCKET?.trim();
  if (!url || !serviceRole || !storageBucket) {
    throw new Error("WORKER_ENV_INCOMPLETE");
  }
  const modeRaw = source.HIVE_WORKER_MODE?.trim() ?? "connect";
  const mode = modeRaw === "serve" ? "serve" : "connect";
  const portRaw = source.HIVE_WORKER_SERVE_PORT?.trim();
  const port = portRaw ? Number(portRaw) : 3001;
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("WORKER_SERVE_PORT_INVALID");
  }
  const faultRaw = source.HIVE_FAULT_INJECT?.trim();
  const HIVE_FAULT_INJECT =
    faultRaw === "extract-once" && source.NODE_ENV === "development"
      ? ("extract-once" as const)
      : undefined;

  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRole,
    HIVE_STORAGE_BUCKET: storageBucket,
    HIVE_WORKER_MODE: mode,
    HIVE_WORKER_SERVE_PORT: port,
    HIVE_FAULT_INJECT,
  };
}
