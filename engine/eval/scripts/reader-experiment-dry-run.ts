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
  READER_EXPERIMENT_L001_MAX_TOOL_CALLS,
  READER_EXPERIMENT_VARIANTS,
} from "@hiveforyou/core/study";

import { estimateReaderExperimentDryRun } from "../src/reader-experiment/dry-run-estimate.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

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
  const stablePrefixCharCount = 12_000;
  const estimate = estimateReaderExperimentDryRun({
    configuredMaxOutputTokens,
    goldenFactCount: golden.facts.length,
    stablePrefixCharCount,
    documentBundleCharCount: documentChars,
    maxToolCalls: READER_EXPERIMENT_L001_MAX_TOOL_CALLS,
  });

  console.info(
    JSON.stringify(
      {
        stage: "dry-run",
        variants: READER_EXPERIMENT_VARIANTS,
        promptHashes: hashes,
        estimate,
        liveRequires: "HIVE_READER_EXPERIMENT_ALLOW_LIVE=1 and explicit --live on qualification CLI",
      },
      null,
      2,
    ),
  );
}

main();
