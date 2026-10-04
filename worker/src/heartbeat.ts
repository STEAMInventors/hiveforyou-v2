import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_HEARTBEAT_PATH = "/tmp/hive-worker-heartbeat";
const HEARTBEAT_INTERVAL_MS = 15_000;

let timer: ReturnType<typeof setInterval> | null = null;

export function resolveHeartbeatPath(
  source: Record<string, string | undefined> = process.env,
): string {
  const configured = source.HIVE_WORKER_HEARTBEAT_PATH?.trim();
  return configured || DEFAULT_HEARTBEAT_PATH;
}

export function writeHeartbeat(pathname: string): void {
  mkdirSync(path.dirname(pathname), { recursive: true });
  writeFileSync(pathname, `${Date.now()}\n`, "utf8");
}

export function startHeartbeat(
  source: Record<string, string | undefined> = process.env,
): void {
  if (timer) {
    return;
  }
  const pathname = resolveHeartbeatPath(source);
  writeHeartbeat(pathname);
  timer = setInterval(() => {
    writeHeartbeat(pathname);
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref?.();
}

export function stopHeartbeat(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
