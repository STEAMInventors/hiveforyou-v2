/**
 * Real OpenAI L001 corpus → Engine 2 Canonical Study proposal /3 (validated proposal only).
 *
 * Does not persist case-intelligence/3 snapshots or touch production UI paths.
 *
 * Requires:
 * - OPENAI_API_KEY
 * - HIVE_CANONICAL_STUDY_ENGINE=openai
 * - HIVE_PROMPT_VERSION=canonical-study-v3
 * - L001_CORPUS_PATHS (comma-separated local PDF paths)
 * - Optional: L001_STRUCTURE_MAP_JSON
 *
 * Example (PowerShell, repo root):
 *   $env:OPENAI_API_KEY="sk-..."
 *   $env:HIVE_CANONICAL_STUDY_ENGINE="openai"
 *   $env:HIVE_PROMPT_VERSION="canonical-study-v3"
 *   $env:L001_CORPUS_PATHS="C:\corpus\iep.pdf,C:\corpus\eval.pdf"
 *   pnpm --filter @hiveforyou/core study:l001-v3
 *
 * Loads @hiveforyou/core via tsx (plain Node cannot execute the workspace TS graph).
 */

import { readFileSync, writeFileSync } from "node:fs";

import {
  createCanonicalStudyEngineV3FromEnv,
  enrichStudyContextWithStructureMap,
  freezeCanonicalStudyContext,
  loadCanonicalStudyPrompt,
  runCanonicalStudyV3,
  validateCanonicalStudyProposalV3,
} from "@hiveforyou/core";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import {
  InMemoryStudyArtifactRepository,
  InMemoryStudyContextRepository,
  InMemoryStudyRunEventRepository,
  InMemoryStudyRunRepository,
} from "@hiveforyou/core";

const paths = (process.env.L001_CORPUS_PATHS ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!paths.length) {
  console.error("Set L001_CORPUS_PATHS to comma-separated local PDF paths.");
  process.exit(1);
}

const caseId = "l001-engine2-v3-case";
const userId = "l001-engine2-v3-user";
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
  groups: [],
  documents: sourceDocuments.map((item, index) => ({
    id: item.ref.discoveryDocumentId,
    stagedDocumentId: item.ref.stagedDocumentId,
    documentType: index === 0 ? "Individualized Education Program" : "Evaluation",
    title: item.ref.originalFilename,
    originalFilename: item.ref.originalFilename,
    sizeBytes: item.ref.sizeBytes,
    familyRole: "plan",
    groupId: "planning",
    recognitionStatus: "recognized",
  })),
  relationships: [],
  missingDocuments: [],
};

function buildInlineStructureMap() {
  return {
    schemaVersion: "hive.structure-map/1",
    discoverRunId: "l001-v3-smoke",
    caseId,
    producedAt: new Date().toISOString(),
    domainResolution: {
      status: "SINGLE_DOMAIN",
      domainLabel: "Special education records",
      domainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
    },
    domainGroups: [],
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
      pageEnd: 20,
      documentType: engine1Result.documents[index]?.documentType ?? "Document",
      title: item.ref.originalFilename,
      familyRole: "plan",
      groupId: "planning",
      recognitionStatus: "recognized",
      provenance: "UPLOADED_EVIDENCE",
    })),
    relationships: [],
    discoveryAnswers: [],
    unresolved: [],
    completeness: { status: "complete", expectations: [] },
    provenance: {
      promptVersion: "discover-v2",
      promptSha256: "l001-v3-smoke",
      providerId: "l001-v3-smoke",
    },
  };
}

const structureMap = process.env.L001_STRUCTURE_MAP_JSON
  ? JSON.parse(readFileSync(process.env.L001_STRUCTURE_MAP_JSON, "utf8"))
  : buildInlineStructureMap();

const request = {
  caseId,
  discoveryRunId: structureMap.discoverRunId,
  sourceDocuments: sourceDocuments.map((item) => item.ref),
  engine1Result,
  questionSet: { id: "qs-l001-v3", questions: [] },
  answerSnapshot: {
    questionSetId: "qs-l001-v3",
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

const promptVersion = process.env.HIVE_PROMPT_VERSION ?? "canonical-study-v3";
const prompt = loadCanonicalStudyPrompt(promptVersion);
const engineConfig = createCanonicalStudyEngineV3FromEnv({
  engine: process.env.HIVE_CANONICAL_STUDY_ENGINE ?? "openai",
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: process.env.HIVE_CANONICAL_STUDY_MODEL ?? process.env.HIVE_OPENAI_MODEL,
  reasoningEffort:
    process.env.HIVE_CANONICAL_STUDY_REASONING_EFFORT ?? process.env.HIVE_DISCOVER_REASONING_EFFORT,
  maxOutputTokens: process.env.HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS,
});

const artifactRepo = new InMemoryStudyArtifactRepository();

const outcome = await runCanonicalStudyV3(request, {
  engine: engineConfig.engine,
  providerId: engineConfig.providerId,
  providerMode: engineConfig.mode,
  modelId: engineConfig.modelId,
  prompt,
  sessionUserId: userId,
  contextRepo: new InMemoryStudyContextRepository(),
  runRepo: new InMemoryStudyRunRepository(),
  eventRepo: new InMemoryStudyRunEventRepository(),
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
const validation = outcome.validation ?? artifact?.validationResultJson ?? null;
const proposal = outcome.proposal ?? artifact?.rawProposalJson ?? null;

const summary = {
  runStatus: outcome.run.status,
  errorCode: outcome.run.errorCode ?? null,
  validationStatus: validation?.status ?? null,
  rejectedCodes: validation?.rejected.map((r) => r.code) ?? [],
  accepted: validation
    ? {
        entityCount: validation.accepted.entities.length,
        claimCount: validation.accepted.claims.length,
        constructs: [...new Set(validation.accepted.claims.map((c) => c.construct))],
        roles: [...new Set(validation.accepted.claims.map((c) => c.role))],
        conflictCount: validation.accepted.conflicts.length,
        missingInformationCount: validation.accepted.missingInformation.length,
      }
    : null,
  proposalModel: proposal?.modelMetadata ?? null,
  artifactPersisted: Boolean(artifact),
  caseIntelligenceVersion: outcome.run.caseIntelligenceVersion ?? null,
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
  const recomputed = validateCanonicalStudyProposalV3(ctx, proposal);
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

  const outPath = process.env.L001_V3_PROPOSAL_OUT;
  if (outPath) {
    writeFileSync(
      outPath,
      JSON.stringify({ proposal, validation, summary }, null, 2),
      "utf8",
    );
    console.log(`Wrote ${outPath}`);
  }
}
