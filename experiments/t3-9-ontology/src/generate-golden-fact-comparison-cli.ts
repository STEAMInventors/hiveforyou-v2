#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadL001ExperimentCorpus } from "./corpus.js";
import {
  buildGoldenFactComparisonReport,
  loadAcceptedFactsFromFile,
  renderGoldenFactComparisonMarkdown,
} from "./golden-fact-comparison.js";
import { loadInitialIepFactCatalog } from "./load-catalog.js";

const experimentRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(experimentRoot, "../..");
const resultsDir = join(experimentRoot, "results");

const defaultPaths = {
  A: join(resultsDir, "mode-A-accepted.json"),
  B: join(resultsDir, "mode-B-accepted.json"),
  C: join(resultsDir, "mode-C-accepted.json"),
};

async function main(): Promise<void> {
  mkdirSync(resultsDir, { recursive: true });

  const catalog = loadInitialIepFactCatalog();
  const { golden, gradeCorpus: corpus } = await loadL001ExperimentCorpus(repoRoot);
  const goldenSourcePath = "engine/eval/golden/tune/l001.json";

  const acceptedByMode = {
    A: loadAcceptedFactsFromFile(defaultPaths.A),
    B: loadAcceptedFactsFromFile(defaultPaths.B),
    C: loadAcceptedFactsFromFile(defaultPaths.C),
  };

  const report = buildGoldenFactComparisonReport({
    golden,
    corpus,
    catalog,
    acceptedByMode,
    goldenSourcePath,
    modeInputPaths: {
      A: defaultPaths.A,
      B: defaultPaths.B,
      C: defaultPaths.C,
    },
  });

  const jsonPath = join(resultsDir, "golden-fact-comparison.json");
  const mdPath = join(resultsDir, "golden-fact-comparison.md");
  const markdown = renderGoldenFactComparisonMarkdown(report);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(mdPath, markdown, "utf8");

  console.info("Wrote:", jsonPath);
  console.info("Wrote:", mdPath);
  console.info(
    "Validation totals:",
    `A ${report.summary.matchedByMode.A}/29 (expected ${report.summary.expectedMatchedByMode.A}/29);`,
    `B ${report.summary.matchedByMode.B}/29 (expected ${report.summary.expectedMatchedByMode.B}/29);`,
    `C ${report.summary.matchedByMode.C}/29 (expected ${report.summary.expectedMatchedByMode.C}/29);`,
    report.summary.validationPassed ? "PASS" : "FAIL",
  );

  if (!report.summary.validationPassed) {
    for (const err of report.summary.validationErrors) {
      console.error(err);
    }
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
