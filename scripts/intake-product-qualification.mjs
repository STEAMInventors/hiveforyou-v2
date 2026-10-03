/**
 * End-to-end product qualification for Intake + IEP Pack (no browser).
 * Requires L001 corpus on disk. Optional real Jev for routing flow.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusDir =
  process.env.L001_CORPUS_DIR ??
  "C:/Users/abhattacharyya/nestiep-corpus/cases/L001/clean";
const outDir = join(repoRoot, "artifacts/intake-qualification");
mkdirSync(outDir, { recursive: true });

await import(pathToFileURL(join(repoRoot, "domain-packs/registry/index.ts")).href);

const { extractDocument } = await import(
  pathToFileURL(join(repoRoot, "packages/intake/src/extract-document.ts")).href
);
const { completeIntakeDomainPack } = await import(
  pathToFileURL(join(repoRoot, "packages/intake/src/complete-intake-domain.ts")).href
);
const { resolveIntakeDomain } = await import(
  pathToFileURL(join(repoRoot, "packages/intake/src/domain-resolution.ts")).href
);

const L001_EXPECTED = [
  "Initial referral",
  "Evaluation plan",
  "Parent evaluation consent",
  "Psychoeducational evaluation",
  "Academic evaluation",
  "Speech/language evaluation",
  "Eligibility determination",
  "Initial IEP",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

if (!existsSync(corpusDir)) {
  console.error(JSON.stringify({ ok: false, error: "L001 corpus missing", corpusDir }));
  process.exit(1);
}

const pdfs = readdirSync(corpusDir).filter((name) => name.toLowerCase().endsWith(".pdf"));
const extractionCounts = new Map();
const normalizedBySourceId = {};
const filenamesBySourceId = {};
const identities = [];

for (const name of pdfs) {
  const bytes = readFileSync(join(corpusDir, name));
  const sourceDocumentId = basename(name, ".pdf");
  const sourceHash = sha256(bytes);
  filenamesBySourceId[sourceDocumentId] = name;

  const before = extractionCounts.get(sourceDocumentId) ?? 0;
  const extracted = await extractDocument({
    documentId: sourceDocumentId,
    bytes,
    mimeType: "application/pdf",
    sourceHash,
    runId: "qualification",
  });
  extractionCounts.set(sourceDocumentId, before + 1);

  if (!extracted.normalizedExtraction) {
    throw new Error(`No normalized extraction for ${name}`);
  }

  normalizedBySourceId[sourceDocumentId] = {
    id: `norm-${sourceDocumentId}`,
    userId: "qual-user",
    sourceDocumentId,
    sourceHash,
    schemaVersion: extracted.normalizedExtraction.schemaVersion,
    normalizedExtraction: extracted.normalizedExtraction,
    createdAt: new Date().toISOString(),
  };

  identities.push({
    id: `id-${sourceDocumentId}`,
    userId: "qual-user",
    intakeRunId: "qual-run",
    sourceDocumentId,
    processingStatus: "CLASSIFIED",
    proposedType: "iep_document",
    confidence: 0.92,
    proposedBy: "JEV",
    classifierVersion: null,
    returnedModel: null,
    classifiedAt: new Date().toISOString(),
    errorCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

const baseRun = {
  id: "qual-run",
  userId: "qual-user",
  caseId: "qual-case",
  status: "SUCCEEDED",
  classifier: "JEV",
  classifierVersion: null,
  idempotencyKey: "qual",
  rawIntent: "Preparing for an IEP meeting",
  explicitDomainId: null,
  jevDomainProposal: null,
  jevDomainConfidence: null,
  resolvedDomainId: null,
  resolutionSource: null,
  studyPath: null,
  packExecutionJson: null,
  completedAt: new Date().toISOString(),
  errorCode: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const explicitFlow = await completeIntakeDomainPack({
  run: { ...baseRun, explicitDomainId: "iep" },
  identities,
  filenamesBySourceId,
  normalizedBySourceId,
  decideDomain: async () => {
    throw new Error("Jev domain routing must not run for explicit domain");
  },
});

const jevCalls = [];
const jevRoutedFlow = await completeIntakeDomainPack({
  run: { ...baseRun, explicitDomainId: null },
  identities,
  filenamesBySourceId,
  normalizedBySourceId,
  decideDomain: async (rawIntent) => {
    jevCalls.push(rawIntent);
    return {
      choice: "iep",
      confidence: 0.88,
      returnedModel: "qualification-fixture",
      classifierVersion: "jev-qual",
    };
  },
});

function packLabels(packExecution) {
  return (packExecution?.logicalDocuments ?? [])
    .filter((row) => row.processingDisposition === "PROCESS")
    .map((row) => row.customerLabel)
    .sort();
}

const explicitLabels = packLabels(explicitFlow.packExecution);
const jevLabels = packLabels(jevRoutedFlow.packExecution);
const missingFromL001 = L001_EXPECTED.filter((label) => !explicitLabels.includes(label));
const openExpectations =
  explicitFlow.packExecution?.completeness.expectations.filter((row) => row.state === "OPEN") ??
  [];

const report = {
  corpus: { dir: corpusDir, pdfCount: pdfs.length },
  oneExtractionInvariant: [...extractionCounts.entries()].every(([, count]) => count === 1),
  extractionCounts: Object.fromEntries(extractionCounts),
  explicitDomain: {
    resolution: resolveIntakeDomain({
      rawIntent: baseRun.rawIntent,
      explicitDomainId: "iep",
    }),
    run: {
      resolutionSource: explicitFlow.run.resolutionSource,
      resolvedDomainId: explicitFlow.run.resolvedDomainId,
      studyPath: explicitFlow.run.studyPath,
      jevDomainProposal: explicitFlow.run.jevDomainProposal,
    },
    understoodLabels: explicitLabels,
    l001ExpectedPresent: L001_EXPECTED.filter((label) => explicitLabels.includes(label)),
    l001Missing: missingFromL001,
  },
  jevRouted: {
    jevCalls,
    run: {
      resolutionSource: jevRoutedFlow.run.resolutionSource,
      resolvedDomainId: jevRoutedFlow.run.resolvedDomainId,
      studyPath: jevRoutedFlow.run.studyPath,
      jevDomainProposal: jevRoutedFlow.run.jevDomainProposal,
      jevDomainConfidence: jevRoutedFlow.run.jevDomainConfidence,
    },
    understoodLabels: jevLabels,
    labelsMatchExplicitFlow: explicitLabels.join("|") === jevLabels.join("|"),
  },
  completeness: {
    openExpectations,
    thingsThatWouldHelpCount: openExpectations.length,
  },
  persistenceExample: {
    sourceDocuments: identities.map((row) => ({
      sourceDocumentId: row.sourceDocumentId,
      filename: filenamesBySourceId[row.sourceDocumentId],
    })),
    genericJevIdentity: identities.map((row) => ({
      sourceDocumentId: row.sourceDocumentId,
      proposedType: row.proposedType,
      confidence: row.confidence,
    })),
    rawIntent: baseRun.rawIntent,
    explicitDomainResolution: explicitFlow.run,
    jevDomainResolution: {
      jevDomainProposal: jevRoutedFlow.run.jevDomainProposal,
      jevDomainConfidence: jevRoutedFlow.run.jevDomainConfidence,
      resolvedDomainId: jevRoutedFlow.run.resolvedDomainId,
      resolutionSource: jevRoutedFlow.run.resolutionSource,
    },
    packExecution: explicitFlow.packExecution,
  },
};

const outPath = join(outDir, "qualification-report.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, reportPath: outPath, summary: report }, null, 2));
