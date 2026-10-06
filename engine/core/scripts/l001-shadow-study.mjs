/**
 * L001 shadow study: document-pages -> atoms -> primitives -> v4 coverage report.
 * Recovered pages come from @hiveforyou/intake (same path as study:l001 extraction).
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runShadowStudy } from "../src/study/shadow/run-shadow-study.ts";
import { extractDocument } from "@hiveforyou/intake";
import { recoverNormalizedDocument } from "@hiveforyou/intake/server-extraction";
import { createCallModelFromEnv } from "@hiveforyou/model-providers/env";

async function buildIntakeExtractDeps() {
  const { createCanvasPageRasterizer } = await import("@hiveforyou/intake-node/canvas-rasterize");
  return {
    recover: recoverNormalizedDocument,
    resolvePageRasterizer: async () => createCanvasPageRasterizer(),
  };
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const corpusDir = process.env.L001_CORPUS_DIR ?? join(repoRoot, "engine/intake/fixtures/l001");
const snapshotDir = join(corpusDir, "document-pages");
const baselinePath =
  process.env.L001_V4_BASELINE ??
  join(repoRoot, "engine/core/fixtures/l001-study-replay-baseline.json");
const outPath =
  process.env.L001_SHADOW_OUT ?? join(repoRoot, "engine/core/fixtures/l001-shadow-study.json");

function loadRepoDotEnv() {
  const envPath = join(repoRoot, ".env");
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq === -1) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // optional
  }
}

loadRepoDotEnv();

const pdfFiles = readdirSync(corpusDir)
  .filter((name) => name.toLowerCase().endsWith(".pdf"))
  .sort();

const sourceIdToDocumentId = new Map(
  pdfFiles.map((file, index) => [`l001-src-${index + 1}`, file]),
);

async function loadDocumentInputs() {
  const documents = [];
  for (const pdf of pdfFiles) {
    const snapshotPath = join(snapshotDir, pdf.replace(/\.pdf$/i, ".json"));
    if (!existsSync(snapshotPath)) {
      throw new Error(`Missing document-pages snapshot: ${snapshotPath}`);
    }
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const pages = snapshot.documentPages;

    const bytes = readFileSync(join(corpusDir, pdf));
    const sourceHash = createHash("sha256").update(bytes).digest("hex");
    const deps = await buildIntakeExtractDeps();
    const extracted = await extractDocument(
      {
        runId: randomUUID(),
        documentId: pdf,
        mimeType: "application/pdf",
        bytes: new Uint8Array(bytes),
        sourceHash,
      },
      deps,
    );
    const normalized = extracted.normalizedExtraction;
    if (!normalized) {
      throw new Error(`EXTRACTION_FAILED:${pdf}`);
    }

    documents.push({
      pages,
      recoveredPages: normalized.pages,
    });
  }
  return documents;
}

function printReport(result, baseline) {
  const claims = baseline.validation?.accepted?.claims ?? [];
  console.log("=== L001 shadow study report ===");
  console.log(`Documents: ${pdfFiles.length}`);
  console.log(`Statements: ${result.statements.length}`);
  console.log(`Findings: ${result.findings.length} (facts: ${result.findings.filter((f) => f.kind === "fact").length})`);
  if (result.coverage) {
    console.log(
      `v4 coverage: ${result.coverage.coveredClaims}/${result.coverage.totalClaims} (${result.coverage.coveragePercent.toFixed(1)}%)`,
    );
    for (const claim of result.coverage.claims) {
      const refSummary = claim.references
        .map((r) => `${r.refId}:${r.covered ? "covered" : "miss"}`)
        .join(", ");
      console.log(`  claim ${claim.claimId}: ${claim.covered ? "covered" : "uncovered"}${claim.partial ? " (partial)" : ""} [${refSummary}]`);
    }
    console.log("Uncovered claims:");
    for (const claim of result.coverage.uncoveredClaims) {
      console.log(`  - ${claim.claimId}: ${claim.primarySnippet}`);
    }
    console.log(`Shadow-only facts: ${result.coverage.shadowOnlyFacts.length}`);
  }
  if (result.stability) {
    console.log(`Stability tier-0 identical share: ${(result.stability.tier0IdenticalShare * 100).toFixed(1)}%`);
    console.log(
      `Stability statements exact: ${(result.stability.statementExactMatchShare * 100).toFixed(1)}% jaccard: ${(result.stability.statementJaccard * 100).toFixed(1)}%`,
    );
    console.log(
      `Stability findings exact: ${(result.stability.findingExactMatchShare * 100).toFixed(1)}% jaccard: ${(result.stability.findingJaccard * 100).toFixed(1)}%`,
    );
  }
  const mergedFacts = result.findings.filter((f) => f.kind === "fact" && f.statementIds.length > 1);
  console.log(`Facts with >1 source: ${mergedFacts.length}`);
  const topMerged = [...mergedFacts]
    .sort((a, b) => b.statementIds.length - a.statementIds.length)
    .slice(0, 10);
  for (const fact of topMerged) {
    console.log(`  - ${fact.statementIds.length} sources: ${fact.detail}`);
  }
  console.log("Validation drops:", result.validationDrops);
  console.log(
    `Tier-1 tokens: in=${result.usage.tier1InputTokens} out=${result.usage.tier1OutputTokens}`,
  );
  console.log(`v4 baseline accepted claims (reference): ${claims.length}`);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const v4Claims = baseline.validation.accepted.claims.map((claim) => ({
  id: claim.id,
  evidenceRefs: claim.evidenceRefs.map((ref) => ({
    id: ref.id,
    sourceDocumentId: ref.sourceDocumentId,
    page: ref.page,
    extractionId: ref.extractionId,
    snippet: ref.snippet,
  })),
}));

const { callModel, modelName } = createCallModelFromEnv();
const documents = await loadDocumentInputs();

const result = await runShadowStudy({
  documents,
  callModel,
  model: modelName,
  v4Claims,
  sourceIdToDocumentId,
  runTier1Twice: process.env.L001_SHADOW_STABILITY === "1",
});

writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      model: modelName,
      result,
    },
    null,
    2,
  ),
  "utf8",
);

printReport(result, baseline);
console.log(`Wrote ${outPath}`);
