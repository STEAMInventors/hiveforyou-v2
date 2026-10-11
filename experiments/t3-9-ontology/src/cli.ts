#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadInitialIepFactCatalog } from "./load-catalog.js";
import { loadL001ExperimentCorpus } from "./corpus.js";
import { estimateDryRun } from "./dry-run-plan.js";
import { runOntologyMode, type ExtractionMode } from "./run-mode.js";

const experimentRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(experimentRoot, "../..");
const resultsDir = join(experimentRoot, "results");

type CliArgs = {
  dryRun: boolean;
  execute: boolean;
  mode: ExtractionMode | "all";
  provider?: "openai" | "anthropic";
  allowAnthropic: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dryRun: argv.includes("--dry-run"),
    execute: argv.includes("--execute"),
    mode: "all",
    allowAnthropic: argv.includes("--allow-anthropic"),
  };
  const modeIdx = argv.indexOf("--mode");
  if (modeIdx >= 0) {
    const raw = argv[modeIdx + 1]?.toUpperCase();
    if (raw === "A" || raw === "B" || raw === "C" || raw === "ALL") {
      args.mode = raw === "ALL" ? "all" : (raw as ExtractionMode);
    }
  }
  const providerIdx = argv.indexOf("--provider");
  if (providerIdx >= 0) {
    const raw = argv[providerIdx + 1]?.toLowerCase();
    if (raw === "openai" || raw === "anthropic") {
      args.provider = raw;
    }
  }
  return args;
}

function modesFromArg(mode: CliArgs["mode"]): ExtractionMode[] {
  return mode === "all" ? ["A", "B", "C"] : [mode];
}

function renderComparisonMarkdown(
  runs: Awaited<ReturnType<typeof runOntologyMode>>[],
  provider: string,
  modelName: string,
): string {
  const lines = [
    "# T3.9 Ontology Extraction — L001 Comparison",
    "",
    `Provider: **${provider}** · Model: **${modelName}** · HEAD: \`603a192\``,
    "",
    "| Mode | Proposed | Accepted | Rejected | Precision | Recall (117) | Initial IEP 29 recall | Modality matches | Input tok | Output tok | Cost USD | Elapsed ms |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const run of runs) {
    const m = run.metrics;
    lines.push(
      `| ${run.mode} | ${m.proposed} | ${m.accepted} | ${m.rejected} | ${m.precision.toFixed(3)} | ${m.recall.toFixed(3)} | ${m.initialIep29.recall.toFixed(3)} (${m.initialIep29.matchedGoldenCount}/${m.initialIep29.goldenFactCount}) | ${m.exactModalityMatches} | ${m.tokenUse.inputTokens} | ${m.tokenUse.outputTokens} | ${m.estimatedCostUsd.toFixed(4)} | ${m.elapsedMs} |`,
    );
  }
  lines.push("", "## Page 3 golden pair", "");
  for (const run of runs) {
    const p3 = run.metrics.page3Reconciliation;
    lines.push(
      `- Mode ${run.mode}: accepted-on-page3=${p3.acceptedProposalCountOnPage3} goldenMatched=${JSON.stringify(p3.goldenMatched)}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dryRun && !args.execute) {
    throw new Error("Specify --dry-run or --execute.");
  }
  if (args.dryRun && args.execute) {
    throw new Error("Use either --dry-run or --execute.");
  }

  const catalog = loadInitialIepFactCatalog();
  const { golden, gradeCorpus, bundles } = await loadL001ExperimentCorpus(repoRoot);
  const modes = modesFromArg(args.mode);

  const provider = args.provider ?? process.env.MODEL_PROVIDER ?? "openai";
  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error("--provider must be openai or anthropic.");
  }
  const modelName =
    process.env.MODEL_NAME ?? (provider === "anthropic" ? "claude-opus-5-5" : "gpt-5.6-sol");

  if (args.dryRun) {
    const plan = estimateDryRun({ catalog, bundles, modes, provider, modelName });
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(join(resultsDir, "dry-run-plan.json"), JSON.stringify(plan, null, 2));
    console.info(JSON.stringify(plan, null, 2));
    return;
  }

  if (!args.provider) {
    throw new Error("--execute requires explicit --provider openai|anthropic.");
  }
  if (provider === "anthropic" && !args.allowAnthropic) {
    throw new Error("Anthropic blocked without --allow-anthropic.");
  }

  const { createCallModelFromEnv } = await import("@hiveforyou/model-providers/env");
  const env = {
    ...process.env,
    MODEL_PROVIDER: provider,
    MODEL_NAME: modelName,
    MODEL_MAX_OUTPUT_TOKENS: String(process.env.MODEL_MAX_OUTPUT_TOKENS ?? 16_000),
  };
  const { callModel, modelName: resolvedModel, provider: resolvedProvider } =
    createCallModelFromEnv(env);

  mkdirSync(resultsDir, { recursive: true });
  const runs = [];
  for (const mode of modes) {
    const run = await runOntologyMode({
      mode,
      catalog,
      golden,
      corpus: gradeCorpus,
      bundles,
      callModel,
      modelName: resolvedModel,
      provider: resolvedProvider,
      resultsDir,
    });
    runs.push(run);
    writeFileSync(join(resultsDir, `mode-${mode}-metrics.json`), JSON.stringify(run.metrics, null, 2));
    writeFileSync(
      join(resultsDir, `mode-${mode}-accepted.json`),
      JSON.stringify({ schemaVersion: "t3-9-ontology/accepted/1", facts: run.accepted }, null, 2),
    );
  }

  writeFileSync(
    join(resultsDir, "comparison.md"),
    renderComparisonMarkdown(runs, resolvedProvider, resolvedModel),
  );
  writeFileSync(
    join(resultsDir, "comparison.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        provider: resolvedProvider,
        modelName: resolvedModel,
        modes: runs.map((r) => ({ mode: r.mode, metrics: r.metrics, dedup: r.dedup })),
      },
      null,
      2,
    ),
  );
  console.info(`Wrote results under ${resultsDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
