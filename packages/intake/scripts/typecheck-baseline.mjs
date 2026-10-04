/**
 * Fail only when intake tsc errors exceed the pinned baseline (pre-extraction-series HEAD).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE_ERROR_COUNT = 11;
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync("pnpm", ["exec", "tsc", "--noEmit"], {
  cwd: packageRoot,
  encoding: "utf8",
  shell: true,
});

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const errorCount = (output.match(/error TS\d+:/g) ?? []).length;

if (errorCount > BASELINE_ERROR_COUNT) {
  console.error(
    `Intake typecheck regression: ${errorCount} errors (baseline allows ≤ ${BASELINE_ERROR_COUNT}).`,
  );
  if (output.trim()) {
    console.error(output.trim());
  }
  process.exit(1);
}

if (errorCount > 0) {
  console.log(
    `Intake typecheck: ${errorCount} error(s) within baseline (≤ ${BASELINE_ERROR_COUNT}).`,
  );
}

process.exit(0);
