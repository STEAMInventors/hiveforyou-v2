/**
 * Real OpenAI L001 corpus → Engine 2 Canonical Study smoke.
 *
 * Requires:
 * - OPENAI_API_KEY
 * - HIVE_CANONICAL_STUDY_ENGINE=openai
 * - HIVE_PROMPT_VERSION=canonical-study-v2
 * - L001_CORPUS_PATHS (comma-separated local PDF paths)
 * - Optional: prior discover structure map JSON at L001_STRUCTURE_MAP_JSON
 *
 * If L001_STRUCTURE_MAP_JSON is unset, runs a minimal inline structure map aligned to uploaded files.
 *
 * Example (PowerShell):
 *   $env:OPENAI_API_KEY="sk-..."
 *   $env:HIVE_CANONICAL_STUDY_ENGINE="openai"
 *   $env:HIVE_PROMPT_VERSION="canonical-study-v2"
 *   $env:L001_CORPUS_PATHS="C:\corpus\iep.pdf,C:\corpus\eval.pdf"
 *   node packages/core/scripts/openai-l001-canonical-study.mjs
 */

import { readFileSync } from "node:fs";

import {
  buildCaseProjections,
  createCanonicalStudyEngineFromEnv,
  enrichStudyContextWithStructureMap,
  freezeCanonicalStudyContext,
  loadCanonicalStudyPrompt,
  runCanonicalStudy,
  validateCanonicalStudyProposal,
} from "@hiveforyou/core";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import {
  InMemoryCaseIntelligenceRepository,
  InMemoryStudyArtifactRepository,
  InMemoryStudyContextRepository,
  InMemoryStudyRunEventRepository,
  InMemoryStudyRunRepository,
} from "@hiveforyou/core";
import { InMemoryCaseProjectionRepository } from "@hiveforyou/core";

const paths = (process.env.L001_CORPUS_PATHS ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!paths.length) {
  console.error("Set L001_CORPUS_PATHS to comma-separated local PDF paths.");
  process.exit(1);
}

const caseId = "l001-engine2-case";
const userId = "l001-engine2-user";
const sourceDocuments = paths.map((filePath, index) => {
  const id = `l001-src-${index + 1}`;
  const filename = filePath.split(/[/\\]/).pop() ?? `doc-${index + 1}.pdf`;
  const bytes = readFileSync(filePath);
  return {
    ref: {
      stagedDocumentId: id,
      discoveryDocumentId: id,
      sourceDocumentId: id,
      originalFilename: filename,
      sizeBytes: bytes.byteLength,
      mimeType: "application/pdf",
    },
    bytes: new Uint8Array(bytes),
  };
});

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
    logicalDocuments: sourceDocuments.map((item, index) => ({
      id: `ld-${index + 1}`,
      domainId: "iep",
      sourceDocumentId: item.ref.sourceDocumentId,
      pageStart: 1,
      pageEnd: 999,
      documentType: "Document (unclassified)",
      title: item.ref.originalFilename,
      familyRole: "record",
      groupId: index === 0 ? "planning" : "evaluations",
      recognitionStatus: "recognized",
      provenance: "UPLOADED_EVIDENCE",
    })),
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

const prompt = loadCanonicalStudyPrompt(process.env.HIVE_PROMPT_VERSION ?? "canonical-study-v2");
const engineConfig = createCanonicalStudyEngineFromEnv({
  engine: process.env.HIVE_CANONICAL_STUDY_ENGINE ?? "openai",
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: process.env.HIVE_CANONICAL_STUDY_MODEL ?? process.env.HIVE_OPENAI_MODEL,
  reasoningEffort:
    process.env.HIVE_CANONICAL_STUDY_REASONING_EFFORT ?? process.env.HIVE_DISCOVER_REASONING_EFFORT,
  maxOutputTokens: process.env.HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS,
});

const artifactRepo = new InMemoryStudyArtifactRepository();
const projectionRepo = new InMemoryCaseProjectionRepository();
const intelligenceRepo = new InMemoryCaseIntelligenceRepository();

const outcome = await runCanonicalStudy(request, {
  engine: engineConfig.engine,
  providerId: engineConfig.providerId,
  providerMode: engineConfig.mode,
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
});

const artifact = await artifactRepo.getByStudyRunId(outcome.run.studyRunId);
const validation = outcome.run.validationResult;
const proposal = artifact?.rawProposalJson ?? null;

let projections = null;
if (outcome.run.status === "SUCCEEDED" || outcome.run.status === "NEEDS_REVIEW") {
  const version = outcome.run.caseIntelligenceVersion ?? 1;
  const intelligence = await intelligenceRepo.getByVersion(caseId, version);
  if (intelligence) {
    projections = buildCaseProjections({ intelligence, customerContext: null });
  }
}

const summary = {
  runStatus: outcome.run.status,
  errorCode: outcome.run.errorCode ?? null,
  validationStatus: validation?.status ?? null,
  rejectedCodes: validation?.rejected.map((r) => r.code) ?? [],
  accepted: validation
    ? {
        entityCount: validation.accepted.entities.length,
        claimCount: validation.accepted.claims.length,
        claimTypes: [...new Set(validation.accepted.claims.map((c) => c.claimType))],
        entityTypes: [...new Set(validation.accepted.entities.map((e) => e.entityType))],
        relationshipCount: validation.accepted.relationships.length,
        eventCount: validation.accepted.events.length,
        conflictCount: validation.accepted.conflicts.length,
        missingnessCount: validation.accepted.missingness.length,
        derivedCount: validation.accepted.derivedClaimCandidates.length,
        temporalKinds: [...new Set(validation.accepted.claims.map((c) => c.temporalKind).filter(Boolean))],
      }
    : null,
  proposalModel: proposal?.modelMetadata ?? null,
  artifactPersisted: Boolean(artifact),
  customerProjectionSections: projections?.customerView.sections.map((s) => s.id) ?? null,
  proProjectionClaimCount: projections?.proView.claims?.length ?? null,
};

console.log(JSON.stringify(summary, null, 2));

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
  const ctx = enrichStudyContextWithStructureMap({
    context: frozen,
    structureMap,
    engine1Result,
  });
  const recomputed = validateCanonicalStudyProposal(ctx, proposal);
  console.log(
    JSON.stringify(
      {
        recomputedValidationStatus: recomputed.status,
        provenanceErrorCodes: recomputed.provenanceErrors.map((e) => e.code),
      },
      null,
      2,
    ),
  );
}
