/**
 * T3.9 Stage 2 dry-run — no Anthropic calls.
 *
 *   pnpm --filter @hiveforyou/eval reader-experiment:dry-run
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadReaderExperimentPromptHashes,
  READER_ARCHITECTURE_VARIANTS,
  READER_EXPERIMENT_L001_MAX_TOOL_CALLS,
} from "@hiveforyou/core/study";

import { estimateReaderExperimentDryRun } from "../src/reader-experiment/dry-run-estimate.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

const L001_LOGICAL_DOCUMENT_COUNT = 8;
const PARALLEL_CONCURRENCY = 8;

function main(): void {
  const goldenPath = join(repoRoot, "engine/eval/golden/tune/l001.json");
  const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as { facts: unknown[] };
  const hashes = loadReaderExperimentPromptHashes();
  const reviewPath = join(repoRoot, "engine/eval/reports/reader-experiment/PROMPT_REVIEW.md");
  if (!existsSync(reviewPath)) {
    throw new Error("Missing PROMPT_REVIEW.md — run agents/scripts/review_reader_experiment_prompts.py first.");
  }

  let documentChars = 0;
  const pagesDir = join(repoRoot, "engine/intake/fixtures/l001/document-pages");
  for (const name of readdirSync(pagesDir)) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const snapshot = JSON.parse(readFileSync(join(pagesDir, name), "utf8")) as {
      documentPages: { pages: { words: { text: string }[] }[] };
    };
    for (const page of snapshot.documentPages.pages) {
      for (const word of page.words) {
        documentChars += word.text.length + 1;
      }
    }
  }

  const configuredMaxOutputTokens = Number(process.env.MODEL_MAX_OUTPUT_TOKENS ?? 16_000);
  const stablePrefixCharCount = 28_000;

  const caseWide = estimateReaderExperimentDryRun({
    configuredMaxOutputTokens,
    goldenFactCount: golden.facts.length,
    stablePrefixCharCount,
    documentBundleCharCount: documentChars,
    maxToolCalls: READER_EXPERIMENT_L001_MAX_TOOL_CALLS,
    label: "case_wide",
    modelExtractionCalls: 1,
  });

  const perDocChars = Math.ceil(documentChars / L001_LOGICAL_DOCUMENT_COUNT);
  const parallel = estimateReaderExperimentDryRun({
    configuredMaxOutputTokens,
    goldenFactCount: golden.facts.length,
    stablePrefixCharCount,
    documentBundleCharCount: perDocChars,
    maxToolCalls: 4,
    label: "parallel_document",
    modelExtractionCalls: L001_LOGICAL_DOCUMENT_COUNT,
    parallelConcurrency: PARALLEL_CONCURRENCY,
  });

  console.info(
    JSON.stringify(
      {
        stage: "dry-run",
        architectures: READER_ARCHITECTURE_VARIANTS,
        promptHashes: hashes,
        estimates: { case_wide: caseWide, parallel_document: parallel },
        liveRequires:
          "HIVE_READER_EXPERIMENT_ALLOW_LIVE=1, HIVE_READER_ARCHITECTURE_VARIANT, and explicit --live on qualification CLI",
      },
      null,
      2,
    ),
  );
}

main();
