/**
 * T0.2 baseline capture: L001 + caleb9 x canonical-study v4 and v4.1 (recorded model calls, no scoring).
 *
 *   pnpm --filter @hiveforyou/core baseline:study
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { InMemoryCaseIntelligenceRepository } from "@hiveforyou/canonical";
import { extractDocument } from "@hiveforyou/intake";
import { recoverNormalizedDocument } from "@hiveforyou/intake/server-extraction";
import {
  createCanonicalStudyEngineFromEnv,
  InMemoryCaseProjectionRepository,
  InMemoryStudyArtifactRepository,
  InMemoryStudyContextRepository,
  InMemoryStudyRunEventRepository,
  InMemoryStudyRunRepository,
  isV4PromptVersion,
  loadCanonicalStudyPrompt,
  runCanonicalStudy,
} from "@hiveforyou/core";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import {
  createCallModelFromEnv,
  isCanonicalStudyFixtureMode,
  parseModelUsage,
  readCanonicalStudyPassSettings,
} from "@hiveforyou/model-providers/env";

import { corpusDirForCase } from "./shadow-golden/paths.ts";
import {
  createRecordingCallModel,
  loadRecordings,
  writeRecordings,
} from "./shadow-golden/recording-call-model.ts";
import { stableJson } from "./shadow-golden/prompt-hash.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const baselinesDir = join(repoRoot, "engine/eval/baselines");
const recordingsPath = join(baselinesDir, "recordings.json");

/** @typedef {"l001" | "caleb9"} BaselineCaseId */

const PROMPT_KEYS = ["canonical-study-v4", "canonical-study-v4.1"];
const CASE_IDS = /** @type {BaselineCaseId[]} */ (["l001", "caleb9"]);

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

function readManifest(corpusDir) {
  const manifestPath = join(corpusDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function listPdfFiles(corpusDir) {
  return readdirSync(corpusDir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function stableCorpusHash(documents) {
  const hash = createHash("sha256");
  for (const doc of documents) {
    hash.update(doc.sha256);
  }
  return hash.digest("hex");
}

async function buildIntakeExtractDeps() {
  const { createCanvasPageRasterizer } = await import("@hiveforyou/intake-node/canvas-rasterize");
  return {
    recover: recoverNormalizedDocument,
    resolvePageRasterizer: async () => createCanvasPageRasterizer(),
  };
}

/** @param {BaselineCaseId} caseId */
async function loadBaselineCorpus(caseId) {
  const corpusDir = corpusDirForCase(caseId);
  const manifest = readManifest(corpusDir);
  const pdfFiles = manifest?.files?.map((f) => f.filename) ?? listPdfFiles(corpusDir);
  const sourcePrefix = manifest?.sourceIdPrefix ?? `${caseId}-src`;
  const deps = await buildIntakeExtractDeps();
  const documents = [];

  for (let index = 0; index < pdfFiles.length; index += 1) {
    const filename = pdfFiles[index];
    const manifestEntry = manifest?.files?.find((f) => f.filename === filename);
    const sourceId = manifestEntry?.sourceDocumentId ?? `${sourcePrefix}-${index + 1}`;
    const bytes = readFileSync(join(corpusDir, filename));
    const byteView = new Uint8Array(bytes);
    const computedSha = createHash("sha256").update(byteView).digest("hex");
    const manifestSha = manifestEntry?.sha256;
    if (manifestSha && manifestSha !== computedSha) {
      throw new Error(`MANIFEST_SHA_MISMATCH:${filename}`);
    }
    const sha256 = manifestSha ?? computedSha;

    const extracted = await extractDocument(
      {
        runId: randomUUID(),
        documentId: filename,
        mimeType: "application/pdf",
        bytes: byteView,
        sourceHash: sha256,
      },
      deps,
    );
    const normalized = extracted.normalizedExtraction;
    if (!normalized) {
      throw new Error(`EXTRACTION_FAILED:${filename}`);
    }

    documents.push({
      sourceId,
      filename,
      sha256,
      bytes: byteView,
      normalized,
    });
  }

  return { caseId, corpusDir, documents, corpusHash: stableCorpusHash(documents) };
}

function buildStudyArtifacts(corpus) {
  const caseId = `${corpus.caseId}-baseline-study`;
  const sourceDocuments = corpus.documents.map((doc) => ({
    ref: {
      stagedDocumentId: doc.sourceId,
      discoveryDocumentId: doc.sourceId,
      sourceDocumentId: doc.sourceId,
      originalFilename: doc.filename,
      sizeBytes: doc.bytes.byteLength,
      mimeType: "application/pdf",
      sha256: doc.sha256,
    },
    bytes: doc.bytes,
  }));

  const extractionsBySourceId = new Map(
    corpus.documents.map((doc) => [doc.sourceId, doc.normalized]),
  );

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

  const structureMap = {
    schemaVersion: "hive-structure-map/1",
    discoverRunId: `${corpus.caseId}-discover-run`,
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
        description: `${corpus.caseId} baseline corpus`,
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
      promptSha256: `${corpus.caseId}-baseline`,
      providerId: "baseline-study",
    },
  };

  const request = {
    caseId,
    discoveryRunId: structureMap.discoverRunId,
    sourceDocuments: sourceDocuments.map((item) => item.ref),
    engine1Result,
    questionSet: { id: `qs-${corpus.caseId}`, questions: [] },
    answerSnapshot: {
      questionSetId: `qs-${corpus.caseId}`,
      answers: {},
      missingNodeStates: {},
      ambiguityNodeStates: {},
      analysisIntent: null,
      userContext: "Baseline capture for canonical study v4 family.",
    },
  };

  const pack = resolveDomainPackFromDiscoveryLabel(engine1Result.domainLabel);
  if (!pack) {
    throw new Error(`DOMAIN_PACK_UNRESOLVED:${corpus.caseId}`);
  }

  return {
    caseId,
    request,
    structureMap,
    engine1Result,
    pack,
    extractionsBySourceId,
    bytesById,
  };
}

function addUsage(totals, usage) {
  const parsed = parseModelUsage(usage);
  if (typeof parsed.inputTokens === "number") {
    totals.inputTokens += parsed.inputTokens;
  }
  if (typeof parsed.outputTokens === "number") {
    totals.outputTokens += parsed.outputTokens;
  }
}

function extractCostFromUsage(usage) {
  if (typeof usage !== "object" || usage === null) {
    return { usd: null, basis: "not_exposed_by_provider" };
  }
  const record = /** @type {Record<string, unknown>} */ (usage);
  const cost =
    record.cost_usd ?? record.costUsd ?? record.cost ?? record.total_cost ?? record.totalCost;
  if (typeof cost === "number" && Number.isFinite(cost)) {
    return { usd: cost, basis: "provider_usage" };
  }
  return { usd: null, basis: "not_exposed_by_provider" };
}

function emptyRejections() {
  return {
    rejected: [],
    provenanceErrors: [],
    integrityErrors: [],
    validationErrors: [],
    unresolved: [],
  };
}

function rejectionBuckets(validation) {
  if (!validation) {
    return emptyRejections();
  }
  return {
    rejected: Array.isArray(validation.rejected) ? validation.rejected : [],
    provenanceErrors: Array.isArray(validation.provenanceErrors) ? validation.provenanceErrors : [],
    integrityErrors: Array.isArray(validation.integrityErrors) ? validation.integrityErrors : [],
    validationErrors: Array.isArray(validation.validationErrors) ? validation.validationErrors : [],
    unresolved: Array.isArray(validation.unresolved) ? validation.unresolved : [],
  };
}

async function runBaselineStudy(input) {
  const { corpus, artifacts, prompt, callModel, provider, modelName, defaultMaxOutputTokens } =
    input;
  if (!isV4PromptVersion(prompt.version)) {
    throw new Error(`PROMPT_NOT_V4_FAMILY:${prompt.version}`);
  }

  const promptEngineVersion = isV4PromptVersion(prompt.version) ? "v4" : "v3";
  const studyPass = readCanonicalStudyPassSettings(process.env);

  const usageTotals = { inputTokens: 0, outputTokens: 0 };
  let lastUsage = null;
  const meteringCallModel = async (req) => {
    const response = await callModel(req);
    addUsage(usageTotals, response.usage);
    lastUsage = response.usage ?? null;
    return response;
  };

  const engineWithMetering = createCanonicalStudyEngineFromEnv(
    {
      engine: isCanonicalStudyFixtureMode(process.env) ? "fixture" : undefined,
      reasoningEffort: studyPass.reasoningEffort,
      maxOutputTokens: studyPass.maxOutputTokens ?? defaultMaxOutputTokens,
    },
    {
      callModel: meteringCallModel,
      modelName,
      promptVersion: promptEngineVersion,
    },
  );

  const artifactRepo = new InMemoryStudyArtifactRepository();
  const projectionRepo = new InMemoryCaseProjectionRepository();
  const intelligenceRepo = new InMemoryCaseIntelligenceRepository();
  const userId = `${corpus.caseId}-baseline-user`;

  const wallClockStart = performance.now();
  const outcome = await runCanonicalStudy(artifacts.request, {
    engine: engineWithMetering.engine,
    providerId: engineWithMetering.providerId,
    providerMode: engineWithMetering.mode,
    modelId: engineWithMetering.modelId,
    prompt,
    sessionUserId: userId,
    contextRepo: new InMemoryStudyContextRepository(),
    runRepo: new InMemoryStudyRunRepository(),
    eventRepo: new InMemoryStudyRunEventRepository(),
    intelligenceRepo,
    projectionRepo,
    studyArtifactRepo: artifactRepo,
    loadStructureMap: async () => artifacts.structureMap,
    loadSourceDocumentBytes: async (ref) => {
      const key =
        artifacts.bytesById.get(ref.stagedDocumentId) ??
        artifacts.bytesById.get(ref.sourceDocumentId ?? "") ??
        artifacts.bytesById.get(ref.discoveryDocumentId ?? "");
      if (!key) {
        throw new Error("MISSING_BYTES");
      }
      return key;
    },
    loadNormalizedExtractionsForStudy: async () => artifacts.extractionsBySourceId,
  });

  const latencyMs = Math.round(performance.now() - wallClockStart);
  const artifact = await artifactRepo.getByStudyRunId(outcome.run.studyRunId);
  const validation = artifact?.validationResultJson ?? null;
  const proposal = artifact?.rawProposalJson ?? null;
  const rejections = rejectionBuckets(validation);
  const claimsProposed = Array.isArray(proposal?.claims) ? proposal.claims.length : 0;
  const claimsAccepted = validation?.accepted?.claims?.length ?? 0;

  return {
    schemaVersion: "hive-study-baseline/1",
    caseId: corpus.caseId,
    promptVersion: prompt.version,
    promptSha256: prompt.sha256,
    provider,
    model: engineWithMetering.modelId ?? modelName,
    runStatus: outcome.run.status,
    validationStatus: validation?.status ?? null,
    acceptedClaims: validation?.accepted?.claims ?? [],
    rejections,
    usage: {
      inputTokens: usageTotals.inputTokens,
      outputTokens: usageTotals.outputTokens,
    },
    cost: extractCostFromUsage(lastUsage),
    latencyMs,
    counts: {
      claimsProposed,
      claimsAccepted,
      rejected: rejections.rejected.length,
      provenanceErrors: rejections.provenanceErrors.length,
    },
    proposalModelMetadata: proposal?.modelMetadata ?? null,
  };
}

function baselineOutPath(caseId, promptVersion) {
  return join(baselinesDir, `${caseId}-${promptVersion}.json`);
}

loadRepoDotEnv();
mkdirSync(baselinesDir, { recursive: true });

const {
  provider,
  modelName,
  maxOutputTokens: defaultMaxOutputTokens,
  callModel: innerCallModel,
} = createCallModelFromEnv();
let recordings = existsSync(recordingsPath) ? loadRecordings(recordingsPath) : {};
let currentDocSha256 = "";

const recordingCallModel = createRecordingCallModel({
  mode: "record",
  recordings,
  inner: innerCallModel,
  getDocSha256: () => currentDocSha256,
});

console.error(`baseline:study provider=${provider} model=${modelName}`);

for (const caseId of CASE_IDS) {
  console.error(`Loading corpus ${caseId}…`);
  const corpus = await loadBaselineCorpus(caseId);
  const artifacts = buildStudyArtifacts(corpus);
  currentDocSha256 = corpus.corpusHash;

  for (const promptKey of PROMPT_KEYS) {
    const prompt = loadCanonicalStudyPrompt(promptKey);
    if (!isV4PromptVersion(prompt.version)) {
      throw new Error(`ASSERT_V4_FAMILY_FAILED:${promptKey}:${prompt.version}`);
    }
    console.error(`Running ${caseId} prompt=${prompt.version}…`);
    const baseline = await runBaselineStudy({
      corpus,
      artifacts,
      prompt,
      callModel: recordingCallModel,
      provider,
      modelName,
      defaultMaxOutputTokens,
    });
    const outPath = baselineOutPath(caseId, prompt.version);
    writeFileSync(outPath, `${stableJson(baseline)}\n`, "utf8");
    writeRecordings(recordingsPath, recordings);
    console.error(`Wrote ${outPath}`);
  }
}

console.error(`Recordings: ${recordingsPath} (${Object.keys(recordings).length} keys)`);
