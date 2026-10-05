/**
 * Real model L001 corpus → Engine 2 Canonical Study smoke (v3/v4 via HIVE_PROMPT_VERSION).
 *
 * Loads repo-root `.env` relative to this script. Run with tsx:
 *   pnpm --filter @hiveforyou/core exec tsx scripts/openai-l001-canonical-study.mjs
 *
 * Requires:
 * - HIVE_CANONICAL_STUDY_ENGINE=openai
 * - MODEL_PROVIDER=openai|anthropic (+ matching API key)
 * - HIVE_PROMPT_VERSION=canonical-study-v4 (recommended)
 * - L001_CORPUS_PATHS (comma-separated local PDF paths)
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { InMemoryCaseIntelligenceRepository } from "@hiveforyou/canonical";
import { extractDocument } from "@hiveforyou/intake";
import { recoverNormalizedDocument } from "@hiveforyou/intake/server-extraction";
import {
  buildCaseProjections,
  createCanonicalStudyEngineFromEnv,
  enrichStudyContextWithStructureMap,
  freezeCanonicalStudyContext,
  InMemoryCaseProjectionRepository,
  InMemoryStudyArtifactRepository,
  InMemoryStudyContextRepository,
  InMemoryStudyRunEventRepository,
  InMemoryStudyRunRepository,
  loadCanonicalStudyPrompt,
  resolveEvidenceReference,
  runCanonicalStudy,
} from "@hiveforyou/core";
import { createCallModelFromEnv } from "@hiveforyou/model-providers/env";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

function loadRepoDotEnv() {
  const envPath = join(repoRoot, ".env");
  let content;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
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
}

loadRepoDotEnv();

console.info = (...args) => {
  console.error(...args);
};
console.warn = (...args) => {
  console.error(...args);
};

const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

const providerRaw = process.env.MODEL_PROVIDER?.trim().toLowerCase() || "openai";
const provider = providerRaw === "anthropic" ? "anthropic" : "openai";
const modelName =
  process.env.MODEL_NAME?.trim() ||
  (provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL);
const openaiKeyLoaded = Boolean(process.env.OPENAI_API_KEY?.trim());
const anthropicKeyLoaded = Boolean(process.env.HIVE_ANTHROPIC_API_KEY?.trim());
const workspaceIdLoaded = Boolean(process.env.HIVE_ANTHROPIC_WORKSPACE_ID?.trim());

console.error(
  `provider: ${provider}, model: ${modelName}, key loaded: ${
    provider === "anthropic" ? (anthropicKeyLoaded ? "yes" : "no") : openaiKeyLoaded ? "yes" : "no"
  }, workspace id loaded: ${workspaceIdLoaded ? "yes" : "no"}`,
);

const defaultCorpusDir =
  process.env.L001_CORPUS_DIR ??
  "C:/Users/abhattacharyya/nestiep-corpus/cases/L001/clean";

function resolveCorpusPaths() {
  const explicit = (process.env.L001_CORPUS_PATHS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (explicit.length) {
    return explicit;
  }
  if (!existsSync(defaultCorpusDir)) {
    return [];
  }
  return readdirSync(defaultCorpusDir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => join(defaultCorpusDir, name));
}

const paths = resolveCorpusPaths();

if (!paths.length) {
  console.error(
    "Set L001_CORPUS_PATHS to comma-separated local PDF paths, or L001_CORPUS_DIR to a folder of PDFs.",
  );
  process.exit(1);
}

async function buildIntakeExtractDeps() {
  const { createCanvasPageRasterizer } = await import("@hiveforyou/intake-node/canvas-rasterize");
  const resolvePageRasterizer = async () => createCanvasPageRasterizer();
  return {
    recover: recoverNormalizedDocument,
    resolvePageRasterizer,
  };
}

async function extractCorpusPdf(sourceDocumentId, bytes, sourceHash) {
  const deps = await buildIntakeExtractDeps();
  const result = await extractDocument(
    {
      documentId: sourceDocumentId,
      bytes,
      mimeType: "application/pdf",
      sourceHash,
      runId: "l001-smoke",
    },
    deps,
  );
  if (!result.normalizedExtraction) {
    throw new Error(`EXTRACTION_FAILED:${sourceDocumentId}:${result.status ?? "unknown"}`);
  }
  return result.normalizedExtraction;
}

function parseMaxOutputTokens() {
  const raw =
    process.env.MODEL_MAX_OUTPUT_TOKENS?.trim() ||
    process.env.HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS?.trim();
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const maxOutputTokens = parseMaxOutputTokens();

const usageTotals = { inputTokens: 0, outputTokens: 0 };

function addUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return;
  }
  if ("input_tokens" in usage && typeof usage.input_tokens === "number") {
    usageTotals.inputTokens += usage.input_tokens;
    usageTotals.outputTokens += typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
    return;
  }
  if ("inputTokens" in usage && typeof usage.inputTokens === "number") {
    usageTotals.inputTokens += usage.inputTokens;
    usageTotals.outputTokens += typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
  }
}

const { callModel: baseCallModel, modelName: callModelDefaultName } = createCallModelFromEnv();
const engineModelName =
  process.env.MODEL_NAME?.trim() ||
  callModelDefaultName ||
  process.env.HIVE_CANONICAL_STUDY_MODEL?.trim() ||
  process.env.HIVE_OPENAI_MODEL?.trim() ||
  modelName;
const callModel = async (req) => {
  const response = await baseCallModel(req);
  addUsage(response.usage);
  return response;
};

const caseId = "l001-engine2-case";
const userId = "l001-engine2-user";
const sourceDocuments = paths.map((filePath, index) => {
  const id = `l001-src-${index + 1}`;
  const filename = filePath.split(/[/\\]/).pop() ?? `doc-${index + 1}.pdf`;
  const bytes = readFileSync(filePath);
  const byteView = new Uint8Array(bytes);
  const sourceHash = createHash("sha256").update(byteView).digest("hex");
  return {
    ref: {
      stagedDocumentId: id,
      discoveryDocumentId: id,
      sourceDocumentId: id,
      originalFilename: filename,
      sizeBytes: bytes.byteLength,
      mimeType: "application/pdf",
      sha256: sourceHash,
    },
    bytes: byteView,
    sourceHash,
  };
});

console.error(`Extracting ${sourceDocuments.length} corpus PDF(s) via @hiveforyou/intake…`);
const extractionsBySourceId = new Map();
for (const item of sourceDocuments) {
  const normalized = await extractCorpusPdf(
    item.ref.sourceDocumentId,
    item.bytes,
    item.sourceHash,
  );
  extractionsBySourceId.set(item.ref.sourceDocumentId, normalized);
}

const bytesById = new Map();
for (const item of sourceDocuments) {
  bytesById.set(item.ref.stagedDocumentId, item.bytes);
  bytesById.set(item.ref.sourceDocumentId, item.bytes);
  bytesById.set(item.ref.discoveryDocumentId, item.bytes);
}

const engine1Result = {
  domainLabel: "Special education records",
  domainResolutionStatus: "resolved",
  groups: [
    { id: "planning", label: "Planning", sequenceOrder: 1 },
    { id: "evaluations", label: "Evaluations", sequenceOrder: 2 },
  ],
  documents: sourceDocuments.map((item, index) => ({
    id: item.ref.discoveryDocumentId,
    stagedDocumentId: item.ref.stagedDocumentId,
    documentType: "Document (unclassified)",
    title: item.ref.originalFilename,
    originalFilename: item.ref.originalFilename,
    sizeBytes: item.ref.sizeBytes,
    familyRole: "record",
    groupId: index === 0 ? "planning" : "evaluations",
    recognitionStatus: "recognized",
  })),
  relationships: [],
  missingDocuments: [],
};

let structureMap;
if (process.env.L001_STRUCTURE_MAP_JSON) {
  structureMap = JSON.parse(readFileSync(process.env.L001_STRUCTURE_MAP_JSON, "utf8"));
} else {
  structureMap = {
    schemaVersion: "hive-structure-map/1",
    discoverRunId: "l001-discover-run",
    caseId,
    producedAt: new Date().toISOString(),
    domainResolution: {
      status: "SINGLE_DOMAIN",
      domainLabel: "Special education records",
      domainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
    },
    domainGroups: [
      {
        id: "dg-iep",
        domainId: "iep",
        domainLabel: "Special education records",
        logicalDocumentIds: sourceDocuments.map((_, i) => `ld-${i + 1}`),
        description: "L001 corpus",
        completeness: { status: "complete", expectations: [] },
      },
    ],
    sourceDocuments: sourceDocuments.map((item) => ({
      sourceDocumentId: item.ref.sourceDocumentId,
      originalFilename: item.ref.originalFilename,
      sizeBytes: item.ref.sizeBytes,
    })),
    logicalDocuments: sourceDocuments.map((item, index) => {
      const normalized = extractionsBySourceId.get(item.ref.sourceDocumentId);
      const pageEnd =
        normalized?.pages?.length && normalized.pages.length > 0
          ? Math.max(...normalized.pages.map((page) => page.pageNumber))
          : 999;
      return {
      id: `ld-${index + 1}`,
      domainId: "iep",
      sourceDocumentId: item.ref.sourceDocumentId,
      pageStart: 1,
      pageEnd,
      documentType: "Document (unclassified)",
      title: item.ref.originalFilename,
      familyRole: "record",
      groupId: index === 0 ? "planning" : "evaluations",
      recognitionStatus: "recognized",
      provenance: "UPLOADED_EVIDENCE",
    };
    }),
    relationships: [],
    chronology: sourceDocuments.map((item, index) => ({
      logicalDocumentId: `ld-${index + 1}`,
      orderingKey: String(index + 1).padStart(4, "0"),
      source: "MODEL",
    })),
    discoveryAnswers: [],
    unresolved: [],
    completeness: { status: "complete", expectations: [] },
    provenance: {
      promptVersion: "discover-v2",
      promptSha256: "l001-smoke",
      providerId: "l001-smoke",
    },
  };
}

const request = {
  caseId,
  discoveryRunId: structureMap.discoverRunId,
  sourceDocuments: sourceDocuments.map((item) => item.ref),
  engine1Result,
  questionSet: { id: "qs-l001", questions: [] },
  answerSnapshot: {
    questionSetId: "qs-l001",
    answers: {},
    missingNodeStates: {},
    ambiguityNodeStates: {},
    analysisIntent: null,
    userContext: "Understand services and goals in these records.",
  },
};

const pack = resolveDomainPackFromDiscoveryLabel(engine1Result.domainLabel);
if (!pack) {
  console.error("Could not resolve domain pack for L001 label.");
  process.exit(1);
}

const promptVersionEnv = process.env.HIVE_PROMPT_VERSION ?? "canonical-study-v2";
const prompt = loadCanonicalStudyPrompt(promptVersionEnv);
const promptEngineVersion = prompt.version === "v4" ? "v4" : "v3";

const apiKey =
  provider === "anthropic"
    ? process.env.HIVE_ANTHROPIC_API_KEY
    : process.env.OPENAI_API_KEY;

const engineConfig = createCanonicalStudyEngineFromEnv(
  {
    engine: process.env.HIVE_CANONICAL_STUDY_ENGINE ?? "openai",
    openaiApiKey: apiKey,
    model: engineModelName,
    reasoningEffort:
      process.env.HIVE_CANONICAL_STUDY_REASONING_EFFORT ?? process.env.HIVE_DISCOVER_REASONING_EFFORT,
    maxOutputTokens,
  },
  {
    callModel,
    promptVersion: promptEngineVersion,
  },
);

const artifactRepo = new InMemoryStudyArtifactRepository();
const projectionRepo = new InMemoryCaseProjectionRepository();
const intelligenceRepo = new InMemoryCaseIntelligenceRepository();

const wallClockStart = performance.now();
let outcome;
try {
  outcome = await runCanonicalStudy(request, {
    engine: engineConfig.engine,
    providerId: engineConfig.providerId,
    providerMode: engineConfig.mode,
    modelId: engineConfig.modelId,
    prompt,
    sessionUserId: userId,
    contextRepo: new InMemoryStudyContextRepository(),
    runRepo: new InMemoryStudyRunRepository(),
    eventRepo: new InMemoryStudyRunEventRepository(),
    intelligenceRepo,
    projectionRepo,
    studyArtifactRepo: artifactRepo,
    loadStructureMap: async () => structureMap,
    loadSourceDocumentBytes: async (ref) => {
      const key =
        bytesById.get(ref.stagedDocumentId) ??
        bytesById.get(ref.sourceDocumentId ?? "") ??
        bytesById.get(ref.discoveryDocumentId ?? "");
      if (!key) {
        throw new Error("MISSING_BYTES");
      }
      return key;
    },
    loadNormalizedExtractionsForStudy: async () => extractionsBySourceId,
  });
} catch (error) {
  const wallClockMs = Math.round(performance.now() - wallClockStart);
  console.log(
    JSON.stringify(
      {
        runStatus: "FAILED",
        errorKind: "exception",
        errorMessage: error instanceof Error ? error.message : String(error),
        wallClockMs,
        modelProvider: provider,
        modelName,
        usage: { ...usageTotals },
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
const wallClockMs = Math.round(performance.now() - wallClockStart);

const artifact = await artifactRepo.getByStudyRunId(outcome.run.studyRunId);
const validation = artifact?.validationResultJson ?? null;
const proposal = artifact?.rawProposalJson ?? null;

function inferErrorKind(run) {
  if (run.status !== "FAILED") {
    return null;
  }
  const msg = `${run.errorCode ?? ""} ${run.errorMessage ?? ""}`.toUpperCase();
  if (msg.includes("TRUNCATED") || msg.includes("MAX_TOKENS")) {
    return "truncated";
  }
  if (run.errorCode === "ENGINE_UNAVAILABLE") {
    return "engine_unavailable";
  }
  if (run.errorCode === "MALFORMED_PROPOSAL") {
    return "malformed_proposal";
  }
  return run.errorCode ?? "failed";
}

function collectValidationMessages(v) {
  if (!v) {
    return [];
  }
  const buckets = [
    v.validationErrors,
    v.rejected,
    v.provenanceErrors,
    v.integrityErrors,
    v.unresolved,
    v.warnings,
  ];
  const messages = [];
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) {
      continue;
    }
    for (const item of bucket) {
      messages.push(item.message ?? item.code ?? String(item));
    }
  }
  return messages;
}

function normalizedExtractionForRef(ref, extractions, structureMapValue) {
  const logical = ref.logicalDocumentId
    ? structureMapValue?.logicalDocuments?.find((doc) => doc.id === ref.logicalDocumentId)
    : undefined;
  const sourceDocumentId = logical?.sourceDocumentId ?? ref.sourceDocumentId;
  if (!sourceDocumentId) {
    return null;
  }
  return extractions.get(sourceDocumentId) ?? null;
}

function countEvidenceResolution(proposalJson, studyContext, extractions, structureMapValue) {
  if (!proposalJson) {
    return { evidenceRefCount: 0, resolvedToPageAndSnippet: 0 };
  }
  const refs = [];
  for (const entity of proposalJson.entities ?? []) {
    refs.push(...(entity.evidenceRefs ?? []));
  }
  for (const claim of proposalJson.claims ?? []) {
    refs.push(...(claim.evidenceRefs ?? []));
  }
  let resolvedToPageAndSnippet = 0;
  for (const ref of refs) {
    const resolved = resolveEvidenceReference(ref, {
      structureMap: structureMapValue,
      sourceDocuments: studyContext.sourceDocuments,
      normalizedExtraction: normalizedExtractionForRef(ref, extractions, structureMapValue),
    });
    if (resolved.physicalPageNumber != null && resolved.canonicalTextSnippet?.trim()) {
      resolvedToPageAndSnippet += 1;
    }
  }
  return { evidenceRefCount: refs.length, resolvedToPageAndSnippet };
}

let studyContextForResolution = null;
if (proposal && validation) {
  const frozen = freezeCanonicalStudyContext({
    request,
    studyRunId: outcome.run.studyRunId,
    resolvedPack: pack,
    idempotencyKey: outcome.run.idempotencyKey,
    providerId: engineConfig.providerId,
    providerMode: engineConfig.mode,
    prompt,
  });
  studyContextForResolution = enrichStudyContextWithStructureMap({
    context: frozen,
    structureMap,
    engine1Result,
  });
}

const evidenceCounts = countEvidenceResolution(
  proposal,
  studyContextForResolution ?? { sourceDocuments: request.sourceDocuments },
  extractionsBySourceId,
  structureMap,
);
const validationMessages = collectValidationMessages(validation);

let projections = null;
if (outcome.run.status === "SUCCEEDED" || outcome.run.status === "NEEDS_REVIEW") {
  const version = outcome.run.caseIntelligenceVersion ?? 1;
  const intelligence = await intelligenceRepo.getByVersion(caseId, version);
  if (intelligence) {
    projections = buildCaseProjections({ intelligence, customerContext: null });
  }
}

const claimsProposed = Array.isArray(proposal?.claims) ? proposal.claims.length : 0;
const claimsPassingValidation = validation?.accepted?.claims?.length ?? 0;

const summary = {
  runStatus: outcome.run.status,
  errorKind: inferErrorKind(outcome.run),
  errorCode: outcome.run.errorCode ?? null,
  errorMessage: outcome.run.errorMessage ?? null,
  validationStatus: validation?.status ?? null,
  claimsProposed,
  claimsPassingValidation,
  evidenceRefCount: evidenceCounts.evidenceRefCount,
  evidenceLocatorsResolvedToPageAndSnippet: evidenceCounts.resolvedToPageAndSnippet,
  conflictsFound: validation?.accepted?.conflicts?.length ?? 0,
  missingInformationItems: validation?.accepted?.missingInformation?.length ?? 0,
  validationErrorCount: validationMessages.length,
  validationErrorMessagesFirst5: validationMessages.slice(0, 5),
  rejectedCodes: validation?.rejected?.map((r) => r.code) ?? [],
  usage: {
    inputTokens: usageTotals.inputTokens,
    outputTokens: usageTotals.outputTokens,
  },
  wallClockMs,
  modelProvider: provider,
  modelName: engineConfig.modelId ?? engineModelName,
  promptVersion: prompt.version,
  accepted: validation
    ? {
        entityCount: validation.accepted.entities.length,
        claimCount: validation.accepted.claims.length,
        claimTypes: [...new Set(validation.accepted.claims.map((c) => c.claimType))],
        entityTypes: [...new Set(validation.accepted.entities.map((e) => e.entityType))],
        relationshipCount: validation.accepted.relationships?.length ?? 0,
        eventCount: validation.accepted.events?.length ?? 0,
        conflictCount: validation.accepted.conflicts.length,
        missingnessCount: validation.accepted.missingInformation.length,
        derivedCount: validation.accepted.derivedClaimCandidates?.length ?? 0,
        temporalKinds: [...new Set(validation.accepted.claims.map((c) => c.temporalKind).filter(Boolean))],
      }
    : null,
  proposalModel: proposal?.modelMetadata ?? null,
  artifactPersisted: Boolean(artifact),
  customerProjectionSections: projections?.customerView.sections.map((s) => s.id) ?? null,
  proProjectionClaimCount: projections?.proView.claims?.length ?? null,
};

console.log(JSON.stringify(summary, null, 2));
