import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  compileDeclarativeCanonicalReasonerContext,
  compileDeclarativeObservationNormalizer,
  computeDeclarativePackContentDigest,
  defaultDeclarativePackRepoRoot,
  hashCompiledCanonicalReasonerContext,
  loadDeclarativePackFromRoot,
} from "@hiveforyou/domain-packs/declarative";
import { createCallModelFromEnv } from "@hiveforyou/model-providers/env";
import { parseReaderAcceptedFactsArtifact } from "@hiveforyou/shared/reader-accepted-facts";
import {
  CANONICAL_STUDY_CONTEXT_SCHEMA,
  INTAKE_STUDY_ANSWER_SNAPSHOT,
  INTAKE_STUDY_QUESTION_SET,
} from "@hiveforyou/shared/canonical-study";

import { ProductionCanonicalReasoner } from "../src/study/canonical-reasoner/production-canonical-reasoner.js";
import { normalizeReaderAcceptedFacts } from "../src/study/observations/normalize-reader-accepted-facts.js";

const STUDY_RUN_ID = "621870eb-10e6-4b6d-af6a-3e2447e3d357";
const repoRoot = defaultDeclarativePackRepoRoot();
const ARTIFACT_PATH = join(
  repoRoot,
  "engine/eval/reports/reader-experiment/local/reader-accepted-facts",
  `${STUDY_RUN_ID}.json`,
);

function buildMinimalContext(sourceDocumentIds) {
  return {
    schemaVersion: CANONICAL_STUDY_CONTEXT_SCHEMA,
    caseId: "case-1",
    studyRunId: STUDY_RUN_ID,
    idempotencyKey: "l001-reasoner",
    createdAt: "2026-10-18T00:00:00.000Z",
    domainLabel: "IEP",
    domainId: "iep",
    domainPackId: "iep",
    domainPackVersion: "0.2.1",
    domainPackVocabulary: {
      entityTypes: [],
      claimTypes: [],
      relationshipTypes: [],
      eventTypes: [],
    },
    engine1Result: {
      domainLabel: "IEP",
      domainResolutionStatus: "resolved",
      groups: [],
      documents: [],
      relationships: [],
      missingDocuments: [],
    },
    sourceDocuments: sourceDocumentIds.map((id) => ({
      stagedDocumentId: id,
      sourceDocumentId: id,
      discoveryDocumentId: id,
      originalFilename: `${id}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1,
    })),
    questionSetVersion: INTAKE_STUDY_QUESTION_SET.id,
    questionSet: INTAKE_STUDY_QUESTION_SET,
    answerSnapshot: INTAKE_STUDY_ANSWER_SNAPSHOT,
    logicalDocuments: [],
    processingPolicy: {
      intentAffectsFacts: false,
      providerId: "test",
      providerMode: "fixture",
    },
  };
}

const artifact = parseReaderAcceptedFactsArtifact(
  JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")),
);
const iepRoot = join(repoRoot, "engine/domain-packs/iep/v0.2.1");
const raw = loadDeclarativePackFromRoot(iepRoot);
const packNormalizer = compileDeclarativeObservationNormalizer(raw);
const packContext = compileDeclarativeCanonicalReasonerContext(raw);
const packSha = hashCompiledCanonicalReasonerContext(packContext);

const sourceIds = [
  ...new Set(
    artifact.facts.flatMap((fact) =>
      (fact.evidence ?? fact.evidenceRefs ?? []).map((ref) => String(ref.sourceDocumentId)),
    ),
  ),
].filter(Boolean);

const normalized = normalizeReaderAcceptedFacts({
  context: buildMinimalContext(sourceIds),
  acceptedFacts: artifact,
  domainId: "iep",
  packPin: {
    packId: packNormalizer.packId,
    packVersion: packNormalizer.packVersion,
    packContentSha256: computeDeclarativePackContentDigest({
      packRoot: iepRoot,
      manifest: raw.manifest,
    }),
  },
  packNormalizer,
});

if (!normalized.snapshot) {
  throw new Error("normalization failed");
}

const envResult = createCallModelFromEnv(process.env);
if (envResult.provider !== "anthropic") {
  console.error(
    "L001 live reasoner requires MODEL_PROVIDER=anthropic and HIVE_ANTHROPIC_API_KEY.",
  );
  process.exit(1);
}

const reasoner = new ProductionCanonicalReasoner({
  providerId: "anthropic-canonical-graph-reasoner-v1",
  modelId: envResult.modelName,
  callModel: envResult.callModel,
  packContext,
  onModelUsage: (usage) => {
    console.log("[L001 reasoner usage — UNVALIDATED proposal]", usage);
  },
});

const proposal = await reasoner.propose({
  studyRunId: normalized.snapshot.studyRunId,
  attemptId: normalized.snapshot.attemptId,
  caseId: normalized.snapshot.caseId,
  domainId: "iep",
  packPin: normalized.snapshot.packPin,
  compiledPackContextSha256: packSha,
  observationSnapshot: normalized.snapshot,
});

let goldenEntityCount;
try {
  const golden = JSON.parse(
    readFileSync(join(repoRoot, "engine/eval/golden/tune/l001.json"), "utf8"),
  );
  goldenEntityCount = golden.facts?.length;
} catch {
  goldenEntityCount = undefined;
}

console.log(
  JSON.stringify(
    {
      label: "UNVALIDATED_MODEL_PROPOSAL",
      observationCount: normalized.snapshot.observations.length,
      observables: proposal.observables.length,
      relationships: proposal.relationships.length,
      resolutions: proposal.resolutions.length,
      candidateConflicts: proposal.candidateConflicts.length,
      candidateFindings: proposal.candidateFindings.length,
      unresolved: proposal.unresolved.length,
      goldenReference: {
        note: "L001 eval golden is claim-level; not used in prompts — counts are indicative only",
        goldenFactCount: goldenEntityCount,
      },
      modelPin: proposal.modelPin,
      packContextSha256: packSha,
    },
    null,
    2,
  ),
);
