import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  compilePackDrivenReaderPrompt,
  parseAndValidatePackDrivenExtraction,
  type ProposalDomainPack,
} from "@hiveforyou/domain-pack";
import { selectRecordDefinitions } from "../../../engine/domain-pack/src/pack-driven-reader/select-checklist.js";
import {
  buildReaderGoldenComparisonReport,
  buildReaderGoldenMismatchAuditReport,
  gradeReaderFactsAgainstGolden,
  type ReaderExperimentCandidateFact,
} from "../../../engine/eval/src/reader-experiment/fact-match.js";
import {
  createCallModelFromEnv,
  parseModelUsage,
} from "../../../engine/model-providers/src/create-call-model-from-env.js";
import { anthropicQualificationCostUsd, estimateDryRunCostUsd } from "./cost.js";
import {
  documentPagesToPackPages,
  loadL001PackDrivenCorpus,
  type L001DocumentBundle,
} from "./corpus.js";
import { createLocalReaderVerifier } from "./local-verifier.js";
import { packExtractionToCandidateFacts } from "./map-extraction-to-candidate.js";

export const QUALIFICATION_MODEL_DEFAULT = "claude-opus-5-5";
export const L001_MODEL_CALL_COUNT = 8;

export type DocumentScorecard = {
  filename: string;
  sourceDocumentId: string;
  documentTypeId: string;
  parseOk: boolean;
  parseErrors: string[];
  extractedFieldCount: number;
  candidateFactCount: number;
  verifiedAcceptedCount: number;
  evidenceRejectedCount: number;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheWriteInputTokens: number;
  };
  costUsd: number;
  goldenFactCount: number;
  matchedGoldenCount: number;
  recall: number;
  precision: number;
};

export type QualificationReport = {
  schemaVersion: "pack-driven-reader-l001/1";
  promptVersion: string;
  packId: string;
  packVersion: string;
  packContentSha256: string;
  provider: string;
  modelName: string;
  modelCalls: number;
  totals: {
    extractedFieldCount: number;
    candidateFactCount: number;
    verifiedAcceptedCount: number;
    evidenceRejectedCount: number;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheWriteInputTokens: number;
    costUsd: number;
  };
  overall: {
    goldenFactCount: number;
    matchedGoldenCount: number;
    recall: number;
    precision: number;
    f1: number;
  };
  initialIep: {
    documentId: "08_initial_iep.pdf";
    goldenFactCount: number;
    matchedGoldenCount: number;
    recall: number;
  };
  perDocument: DocumentScorecard[];
  comparison: ReturnType<typeof buildReaderGoldenComparisonReport>;
  mismatchAudit: ReturnType<typeof buildReaderGoldenMismatchAuditReport>;
  initialIepMismatchAudit: ReturnType<typeof buildReaderGoldenMismatchAuditReport>;
};

function loadIepV03Pack(repoRoot: string): ProposalDomainPack {
  const path = join(repoRoot, "brain/domain-packs/iep/iep-pack.v0.3.proposed.json");
  return JSON.parse(readFileSync(path, "utf8")) as ProposalDomainPack;
}

function buildCaseManifest(bundles: L001DocumentBundle[]) {
  return bundles.map((b) => ({
    sourceDocumentId: b.sourceDocumentId,
    filename: b.filename,
    pageCount: b.documentPages.pages.length,
    logicalDocumentId: undefined,
    documentTypeId: b.documentTypeId,
  }));
}

export async function planDryRun(repoRoot: string): Promise<{
  provider: string;
  modelName: string;
  modelCalls: number;
  estimatedCostUsd: number;
  command: string;
  perDocumentUserChars: number[];
  stablePrefixChars: number;
  promptVersion: string;
  packContentSha256: string;
}> {
  const pack = loadIepV03Pack(repoRoot);
  const { bundles } = await loadL001PackDrivenCorpus(repoRoot);
  const manifest = buildCaseManifest(bundles);
  const perDocumentUserChars: number[] = [];
  let stablePrefixChars = 0;
  let promptVersion = "";
  let packHash = "";

  for (const bundle of bundles) {
    const compiled = compilePackDrivenReaderPrompt({
      pack,
      documentTypeId: bundle.documentTypeId,
      caseManifest: manifest,
      document: {
        sourceDocumentId: bundle.sourceDocumentId,
        pages: documentPagesToPackPages(bundle.documentPages),
      },
    });
    if (!stablePrefixChars) {
      stablePrefixChars = compiled.stableSystemPrefix.length;
      promptVersion = compiled.promptVersion;
      packHash = compiled.packContentSha256;
    }
    perDocumentUserChars.push(compiled.caseUserContent.length);
  }

  const provider = process.env.MODEL_PROVIDER?.trim() || "anthropic";
  const modelName = process.env.MODEL_NAME?.trim() || QUALIFICATION_MODEL_DEFAULT;
  const maxOutputTokens = Number(process.env.MODEL_MAX_OUTPUT_TOKENS ?? 16_000);
  const estimatedCostUsd = estimateDryRunCostUsd({
    stablePrefixChars,
    perDocumentUserChars,
    maxOutputTokens,
    modelCalls: L001_MODEL_CALL_COUNT,
  });

  return {
    provider,
    modelName,
    modelCalls: L001_MODEL_CALL_COUNT,
    estimatedCostUsd,
    command: "pnpm --filter @hiveforyou/pack-driven-reader-l001 qualify",
    perDocumentUserChars,
    stablePrefixChars,
    promptVersion,
    packContentSha256: packHash,
  };
}

export async function runPackDrivenL001Qualification(repoRoot: string): Promise<QualificationReport> {
  const pack = loadIepV03Pack(repoRoot);
  const { golden, gradeCorpus, bundles } = await loadL001PackDrivenCorpus(repoRoot);
  const manifest = buildCaseManifest(bundles);
  const { provider, modelName, maxOutputTokens, callModel } = createCallModelFromEnv(process.env);
  const verifier = createLocalReaderVerifier(bundles);

  const perDocument: DocumentScorecard[] = [];
  const allAccepted: ReaderExperimentCandidateFact[] = [];
  let promptVersion = "";
  let packId = "";
  let packVersion = "";
  let packHash = "";

  for (const bundle of bundles) {
    const compiled = compilePackDrivenReaderPrompt({
      pack,
      documentTypeId: bundle.documentTypeId,
      caseManifest: manifest,
      document: {
        sourceDocumentId: bundle.sourceDocumentId,
        pages: documentPagesToPackPages(bundle.documentPages),
      },
    });
    promptVersion = compiled.promptVersion;
    packId = compiled.packId;
    packVersion = compiled.packVersion;
    packHash = compiled.packContentSha256;

    const started = performance.now();
    const response = await callModel({
      model: modelName,
      maxOutputTokens,
      systemPrompt: compiled.stableSystemPrefix,
      userContent: compiled.caseUserContent,
      textFormat: {
        type: "json_schema",
        name: "pack_driven_reader_extraction",
        strict: true,
        schema: compiled.outputJsonSchema,
      },
      logLabel: "pack-driven-reader-l001",
    });
    const elapsedMs = Math.round(performance.now() - started);
    const usageRaw = parseModelUsage(response.usage);
    const usage = {
      inputTokens: usageRaw.inputTokens ?? 0,
      outputTokens: usageRaw.outputTokens ?? 0,
      cacheReadInputTokens: usageRaw.cacheReadInputTokens ?? 0,
      cacheWriteInputTokens: usageRaw.cacheWriteInputTokens ?? 0,
    };
    const costUsd = anthropicQualificationCostUsd(usage);

    let raw: unknown;
    try {
      raw = JSON.parse(response.outputText ?? "{}");
    } catch {
      raw = {};
    }

    const selectedRecords = selectRecordDefinitions(pack, compiled.selectedRecordTypeIds);
    const parsed = parseAndValidatePackDrivenExtraction({
      raw,
      expectedSourceDocumentId: bundle.sourceDocumentId,
      selectedRecords,
    });

    const candidates = parsed.ok
      ? packExtractionToCandidateFacts({
          sourceDocumentId: bundle.sourceDocumentId,
          recordInstances: parsed.recordInstances,
        })
      : [];

    const verifiedRows = [];
    for (const candidate of candidates) {
      verifiedRows.push(await verifier.verifyCandidate(candidate));
    }
    const accepted = verifiedRows.filter((r) => r.accepted).map((r) => r.candidate);
    allAccepted.push(...accepted);

    const docGolden = golden.facts.filter((f) => f.documentId === bundle.filename);
    const docMetrics = gradeReaderFactsAgainstGolden({
      golden: { ...golden, facts: docGolden },
      candidates: accepted,
      corpus: gradeCorpus,
    });

    perDocument.push({
      filename: bundle.filename,
      sourceDocumentId: bundle.sourceDocumentId,
      documentTypeId: bundle.documentTypeId,
      parseOk: parsed.ok,
      parseErrors: parsed.errors,
      extractedFieldCount: parsed.recordInstances.reduce((n, r) => n + r.fields.length, 0),
      candidateFactCount: candidates.length,
      verifiedAcceptedCount: accepted.length,
      evidenceRejectedCount: candidates.length - accepted.length,
      latencyMs: elapsedMs,
      usage,
      costUsd,
      goldenFactCount: docMetrics.goldenFactCount,
      matchedGoldenCount: docMetrics.matchedCount,
      recall: docMetrics.recall,
      precision: docMetrics.precision,
    });
  }

  const comparison = buildReaderGoldenComparisonReport({
    golden,
    candidates: allAccepted,
    corpus: gradeCorpus,
  });
  const overallMetrics = gradeReaderFactsAgainstGolden({
    golden,
    candidates: allAccepted,
    corpus: gradeCorpus,
  });
  const f1 =
    overallMetrics.precision + overallMetrics.recall > 0
      ? (2 * overallMetrics.precision * overallMetrics.recall) /
        (overallMetrics.precision + overallMetrics.recall)
      : 0;

  const initialIepFacts = golden.facts.filter((f) => f.documentId === "08_initial_iep.pdf");
  const initialIepMetrics = gradeReaderFactsAgainstGolden({
    golden: { ...golden, facts: initialIepFacts },
    candidates: allAccepted,
    corpus: gradeCorpus,
  });

  const mismatchAudit = buildReaderGoldenMismatchAuditReport({
    golden,
    comparison,
    candidates: allAccepted,
    corpus: gradeCorpus,
  });
  const initialIepComparison = buildReaderGoldenComparisonReport({
    golden: { ...golden, facts: initialIepFacts },
    candidates: allAccepted,
    corpus: gradeCorpus,
  });
  const initialIepMismatchAudit = buildReaderGoldenMismatchAuditReport({
    golden: { ...golden, facts: initialIepFacts },
    comparison: initialIepComparison,
    candidates: allAccepted,
    corpus: gradeCorpus,
    documentFilter: "08_initial_iep.pdf",
  });

  const totals = perDocument.reduce(
    (acc, row) => {
      acc.extractedFieldCount += row.extractedFieldCount;
      acc.candidateFactCount += row.candidateFactCount;
      acc.verifiedAcceptedCount += row.verifiedAcceptedCount;
      acc.evidenceRejectedCount += row.evidenceRejectedCount;
      acc.latencyMs += row.latencyMs;
      acc.inputTokens += row.usage.inputTokens;
      acc.outputTokens += row.usage.outputTokens;
      acc.cacheReadInputTokens += row.usage.cacheReadInputTokens;
      acc.cacheWriteInputTokens += row.usage.cacheWriteInputTokens;
      acc.costUsd += row.costUsd;
      return acc;
    },
    {
      extractedFieldCount: 0,
      candidateFactCount: 0,
      verifiedAcceptedCount: 0,
      evidenceRejectedCount: 0,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
      costUsd: 0,
    },
  );

  return {
    schemaVersion: "pack-driven-reader-l001/1",
    promptVersion,
    packId,
    packVersion,
    packContentSha256: packHash,
    provider,
    modelName,
    modelCalls: L001_MODEL_CALL_COUNT,
    totals,
    overall: {
      goldenFactCount: overallMetrics.goldenFactCount,
      matchedGoldenCount: overallMetrics.matchedCount,
      recall: overallMetrics.recall,
      precision: overallMetrics.precision,
      f1,
    },
    initialIep: {
      documentId: "08_initial_iep.pdf",
      goldenFactCount: initialIepMetrics.goldenFactCount,
      matchedGoldenCount: initialIepMetrics.matchedCount,
      recall: initialIepMetrics.recall,
    },
    perDocument,
    comparison,
    mismatchAudit,
    initialIepMismatchAudit,
  };
}

export function writeQualificationReport(repoRoot: string, report: QualificationReport): string {
  const outDir = join(repoRoot, "engine/eval/reports/pack-driven-reader-l001");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "l001-qualification-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  return outPath;
}
