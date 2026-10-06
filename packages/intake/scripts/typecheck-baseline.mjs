/**
 * Fail when intake tsc reports an error line not listed in the pinned baseline.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(packageRoot, "scripts", "typecheck-baseline-errors.txt");

/** @param {string} output */
function extractErrorLines(output) {
  const lines = [];
  for (const line of output.split(/\r?\n/)) {
    if (/error TS\d+:/.test(line)) {
      lines.push(line.trim());
    }
  }
  return lines;
}

const baselineText = readFileSync(baselinePath, "utf8");
const baselineSet = new Set(
  baselineText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0),
);

const result = spawnSync("pnpm", ["exec", "tsc", "--noEmit"], {
  cwd: packageRoot,
  encoding: "utf8",
  shell: true,
});

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const errorLines = extractErrorLines(output);
const errorSet = new Set(errorLines);

const newErrors = errorLines.filter((line) => !baselineSet.has(line));

if (newErrors.length > 0) {
  console.error(
    `Intake typecheck regression: ${newErrors.length} error line(s) not in baseline (${baselineSet.size} pinned).`,
  );
  for (const line of newErrors) {
    console.error(line);
  }
  process.exit(1);
}

if (errorLines.length > 0) {
  const resolved = [...baselineSet].filter((line) => !errorSet.has(line));
  if (resolved.length > 0) {
    console.log(
      `Intake typecheck: ${errorLines.length} known error(s); ${resolved.length} baseline line(s) no longer reported (update baseline when intentional).`,
    );
  } else {
    console.log(`Intake typecheck: ${errorLines.length} known error(s) match baseline.`);
  }
}

process.exit(0);
