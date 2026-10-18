import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function defaultDeclarativePackRepoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  let cursor = here;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(cursor, "engine", "domain-packs", "registry");
    if (existsSync(candidate)) {
      return join(cursor);
    }
    cursor = dirname(cursor);
  }
  return join(process.cwd());
}
