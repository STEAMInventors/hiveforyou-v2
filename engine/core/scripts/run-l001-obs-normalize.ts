import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CANONICAL_STUDY_CONTEXT_SCHEMA,
  INTAKE_STUDY_ANSWER_SNAPSHOT,
  INTAKE_STUDY_QUESTION_SET,
  type CanonicalStudyContext,
} from "@hiveforyou/shared/canonical-study";
import { parseReaderAcceptedFactsArtifact } from "@hiveforyou/shared/reader-accepted-facts";
import {
  compileDeclarativeObservationNormalizer,
  defaultDeclarativePackRepoRoot,
  loadDeclarativePackFromRoot,
} from "@hiveforyou/domain-packs/declarative";

import { hashCanonicalJson } from "../src/study/fingerprint.js";
import { normalizeReaderAcceptedFacts } from "../src/study/observations/normalize-reader-accepted-facts.js";

const STUDY_RUN_ID = "621870eb-10e6-4b6d-af6a-3e2447e3d357";
const artifactPath = join(
  defaultDeclarativePackRepoRoot(),
  `engine/eval/reports/reader-experiment/local/reader-accepted-facts/${STUDY_RUN_ID}.json`,
);

const manifest = JSON.parse(
  readFileSync(join(defaultDeclarativePackRepoRoot(), "engine/intake/fixtures/l001/manifest.json"), "utf8"),
) as { files: Array<{ sourceDocumentId: string }> };
const registeredEnv = process.env.L001_REGISTERED_SOURCE_IDS?.trim();
const sourceIds = registeredEnv
  ? (JSON.parse(registeredEnv) as string[])
  : manifest.files.map((file) => file.sourceDocumentId);

const context: CanonicalStudyContext = {
  schemaVersion: CANONICAL_STUDY_CONTEXT_SCHEMA,
  caseId: "case-1",
  studyRunId: "run-1",
  idempotencyKey: "test",
  createdAt: "2026-01-01T00:00:00.000Z",
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
  sourceDocuments: sourceIds.map((id) => ({
    stagedDocumentId: id,
    sourceDocumentId: id,
    originalFilename: `${id}.pdf`,
    sizeBytes: 1,
  })),
  engine1Result: {
    domainLabel: "IEP",
    domainResolutionStatus: "resolved",
    groups: [],
    documents: [],
    relationships: [],
    missingDocuments: [],
  },
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

const artifact = parseReaderAcceptedFactsArtifact(
  JSON.parse(readFileSync(artifactPath, "utf8")) as unknown,
);
const iepRaw = loadDeclarativePackFromRoot(
  join(defaultDeclarativePackRepoRoot(), "engine/domain-packs/iep/v0.2.1"),
);
const iepNormalizer = compileDeclarativeObservationNormalizer(iepRaw);
const input = {
  context,
  acceptedFacts: artifact,
  domainId: "iep",
  packPin: {
    packId: iepNormalizer.packId,
    packVersion: iepNormalizer.packVersion,
    packContentSha256: hashCanonicalJson({ pack: "iep-v0.2.1" }),
  },
  packNormalizer: iepNormalizer,
  createdAt: "2026-10-18T00:00:00.000Z",
};

const first = normalizeReaderAcceptedFacts(input);
const second = normalizeReaderAcceptedFacts(input);

const quarantineCodes = first.quarantined.reduce<Record<string, number>>((acc, row) => {
  acc[row.code] = (acc[row.code] ?? 0) + 1;
  return acc;
}, {});

console.log(
  JSON.stringify(
    {
      artifactPath,
      inputFacts: artifact.facts.length,
      accepted: first.accepted.length,
      quarantined: first.quarantined.length,
      quarantineCodes,
      contentDigest: first.snapshot?.contentDigest,
      determinism: {
        idsMatch:
          first.accepted.map((obs) => obs.id).join("\n") ===
          second.accepted.map((obs) => obs.id).join("\n"),
        digestMatch: first.snapshot?.contentDigest === second.snapshot?.contentDigest,
      },
      periodObservations: first.accepted.filter((obs) => obs.value.kind === "period").length,
    },
    null,
    2,
  ),
);
