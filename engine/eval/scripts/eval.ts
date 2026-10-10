/**
 * Score saved T0.2 study baselines against certified goldens (no model calls).
 *
 *   pnpm --filter @hiveforyou/eval eval -- --split tune --source baselines/v4
 *   pnpm --filter @hiveforyou/eval eval -- --split tune --source baselines/v4.1 --compare baselines/v4
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertGoldenSplit, type GoldenSplit } from "../src/golden/validate.js";
import { runEvalCli, runReaderGoldenCompareCli } from "../src/eval/run-eval.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const evalRoot = resolve(scriptDir, "..");
const repoRoot = resolve(evalRoot, "../..");

function parseArgs(argv: string[]): {
  split: GoldenSplit;
  source: string;
  compare?: string;
} {
  let split: GoldenSplit | null = null;
  let source: string | null = null;
  let compare: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--split") {
      const value = argv[++i] ?? "";
      if (!assertGoldenSplit(value)) {
        throw new Error(`Invalid --split ${value}`);
      }
      split = value;
    } else if (arg === "--source") {
      source = argv[++i] ?? null;
    } else if (arg === "--compare") {
      compare = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.error("Usage: eval --split tune|holdout|tripwire --source baselines/v4|v4.1 [--compare baselines/v4]");
      process.exit(0);
    }
  }

  if (!split || !source) {
    throw new Error("Required: --split <split> --source baselines/v4|v4.1");
  }

  return { split, source, compare };
}

async function main(): Promise<void> {
  if (process.argv.includes("--reader-golden-compare")) {
    const filtered = process.argv.slice(2).filter((a) => a !== "--reader-golden-compare");
    const { outPath } = await runReaderGoldenCompareCli({
      repoRoot,
      argv: filtered,
      env: process.env,
    });
    console.info("[reader-golden-compare] wrote", outPath);
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const generatedIso = new Date().toISOString();
  const reportsDir = join(evalRoot, "reports");

  const { reportPaths } = await runEvalCli({
    repoRoot,
    evalRoot,
    split: args.split,
    sourceArg: args.source,
    compareSourceArg: args.compare,
    reportsDir,
    generatedIso,
  });

  for (const p of reportPaths) {
    console.log(p.replace(/\\/g, "/"));
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
