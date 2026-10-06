import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

export function repoRoot(): string {
  return resolve(scriptDir, "../../../..");
}

export function goldenDirForCase(caseId: string): string {
  return join(repoRoot(), "engine/intake/fixtures/golden/shadow", caseId);
}

export function corpusDirForCase(caseId: "l001" | "caleb9"): string {
  if (caseId === "l001") {
    return join(repoRoot(), "engine/intake/fixtures/l001");
  }
  return join(repoRoot(), "engine/intake/fixtures/caleb9");
}
