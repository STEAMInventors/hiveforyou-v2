import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  planDryRun,
  runPackDrivenL001Qualification,
  writeQualificationReport,
} from "./run-qualification.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

const APPROVAL_COST_CEILING_USD = 2;

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const execute = args.has("--execute");

  if (!dryRun && !execute) {
    console.error("Usage: tsx src/cli.ts --dry-run | --execute");
    process.exit(1);
  }

  const plan = await planDryRun(repoRoot);

  if (dryRun) {
    console.info(
      JSON.stringify(
        {
          stage: "dry-run",
          provider: plan.provider,
          model: plan.modelName,
          modelCalls: plan.modelCalls,
          estimatedTotalCostUsd: plan.estimatedCostUsd,
          command: plan.command,
          stablePrefixChars: plan.stablePrefixChars,
          perDocumentUserChars: plan.perDocumentUserChars,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.info("=== Pack-driven Reader L001 qualification (live) ===");
  console.info(`Provider: ${plan.provider}`);
  console.info(`Model: ${plan.modelName}`);
  console.info(`Expected model calls: ${plan.modelCalls} (sequential, one per document)`);
  console.info(`Estimated total cost (USD): ${plan.estimatedCostUsd.toFixed(4)}`);
  console.info(`Command: ${plan.command}`);

  if (plan.estimatedCostUsd > APPROVAL_COST_CEILING_USD) {
    console.error(
      `STOP: estimated cost $${plan.estimatedCostUsd.toFixed(2)} exceeds $${APPROVAL_COST_CEILING_USD.toFixed(2)} approval ceiling.`,
    );
    process.exit(2);
  }

  if (process.env.HIVE_PACK_DRIVEN_READER_L001_ALLOW_LIVE !== "1") {
    console.error(
      "STOP: set HIVE_PACK_DRIVEN_READER_L001_ALLOW_LIVE=1 to authorize paid model calls for this harness.",
    );
    process.exit(2);
  }

  if (!process.env.HIVE_ANTHROPIC_API_KEY?.trim()) {
    console.error("STOP: HIVE_ANTHROPIC_API_KEY is required for live qualification.");
    process.exit(2);
  }

  const report = await runPackDrivenL001Qualification(repoRoot);
  const outPath = writeQualificationReport(repoRoot, report);

  console.info(
    JSON.stringify(
      {
        reportPath: outPath,
        overall: report.overall,
        initialIep: report.initialIep,
        totals: report.totals,
        perDocument: report.perDocument.map((d) => ({
          filename: d.filename,
          recall: d.recall,
          precision: d.precision,
          matchedGoldenCount: d.matchedGoldenCount,
          goldenFactCount: d.goldenFactCount,
          verifiedAcceptedCount: d.verifiedAcceptedCount,
          evidenceRejectedCount: d.evidenceRejectedCount,
          costUsd: d.costUsd,
        })),
        unmatchedGoldenCount: report.comparison.perGoldenFact.filter((r) => r.status !== "matched")
          .length,
        unmatchedCandidateCount: report.comparison.unmatchedCandidateIds.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[pack-driven-reader-l001] failed", error instanceof Error ? error.message : error);
  process.exit(1);
});
