const DEFAULT_PORT = 4318;

export function resolveEvalPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.HIVE_EVAL_PORT?.trim();
  if (!raw) {
    return DEFAULT_PORT;
  }
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid HIVE_EVAL_PORT: ${raw} (expected integer 1..65535)`);
  }
  return port;
}

export function requireEvalToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.HIVE_EVAL_TOKEN?.trim();
  if (!token) {
    throw new Error("HIVE_EVAL_TOKEN is required and must be non-empty");
  }
  return token;
}
