import { createHash } from "node:crypto";

import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { DomainPackPin, ObservationSnapshot, SnapshotObservation } from "@hiveforyou/shared/canonical-study-graph";
import { OBSERVATION_SNAPSHOT_SCHEMA_VERSION } from "@hiveforyou/shared/canonical-study-graph";
import { validateObservationSnapshot } from "@hiveforyou/shared/canonical-study-graph";
import type { ReaderAcceptedFactsArtifact } from "@hiveforyou/shared/reader-accepted-facts";
import type { DeclarativeObservationNormalizerContext } from "@hiveforyou/domain-packs/declarative";

import { hashCanonicalJson } from "../fingerprint.js";
import {
  documentIdsInContext,
  validateDocumentEvidenceRefs,
} from "../validate-document-evidence.js";
import {
  OBSERVATION_SNAPSHOT_ADAPTER_SCHEMA_VERSION,
  type ObservationNormalizationQuarantineRecord,
  type ObservationNormalizationResult,
} from "./types.js";
import {
  claimValueFromWire,
  effectivePeriodFromWire,
  evidenceRefsFromWire,
  isVerifiedReaderFact,
  observedOnFromWire,
  readerFactIdFromWire,
  type WireReaderFact,
} from "./wire-fact.js";

export { OBSERVATION_SNAPSHOT_ADAPTER_SCHEMA_VERSION };

export type NormalizeReaderAcceptedFactsInput = {
  context: CanonicalStudyContext;
  acceptedFacts: ReaderAcceptedFactsArtifact;
  domainId: string;
  packPin: DomainPackPin;
  packNormalizer: DeclarativeObservationNormalizerContext;
  createdAt?: string;
};

function stableObservationId(input: {
  studyRunId: string;
  attemptId: string;
  readerFactId: string;
  predicateTypeId: string;
  value: SnapshotObservation["value"];
  evidenceSignature: string;
}): string {
  const material = {
    studyRunId: input.studyRunId,
    attemptId: input.attemptId,
    readerFactId: input.readerFactId,
    predicateTypeId: input.predicateTypeId,
    value: input.value,
    evidenceSignature: input.evidenceSignature,
  };
  const digest = createHash("sha256").update(hashCanonicalJson(material)).digest("hex").slice(0, 20);
  return `obs-${digest}`;
}

function evidenceSignature(refs: SnapshotObservation["evidenceRefs"]): string {
  const normalized = refs
    .map(
      (ref) =>
        `${ref.sourceDocumentId}|${ref.page ?? ""}|${ref.snippet ?? ""}|${ref.spanStart ?? ""}|${ref.spanEnd ?? ""}`,
    )
    .sort();
  return createHash("sha256").update(normalized.join("\n")).digest("hex");
}

function toSnapshotEvidenceRefs(
  refs: ReturnType<typeof evidenceRefsFromWire>,
): SnapshotObservation["evidenceRefs"] {
  return refs.map((ref) => ({
    id: ref.id,
    sourceDocumentId: ref.sourceDocumentId,
    logicalDocumentId: ref.logicalDocumentId,
    page: ref.page,
    pageEnd: ref.pageEnd,
    spanStart: ref.spanStart,
    spanEnd: ref.spanEnd,
    snippet: ref.snippet,
    extractionId: ref.extractionId,
    sourceType: "document" as const,
  }));
}

function quarantine(
  bucket: ObservationNormalizationQuarantineRecord[],
  index: number,
  fact: WireReaderFact,
  code: string,
  message: string,
): void {
  bucket.push({
    index,
    readerFactId: typeof fact.id === "string" ? fact.id : null,
    code,
    message,
    fact,
  });
}

export function normalizeReaderAcceptedFacts(
  input: NormalizeReaderAcceptedFactsInput,
): ObservationNormalizationResult {
  const quarantined: ObservationNormalizationQuarantineRecord[] = [];
  const accepted: SnapshotObservation[] = [];
  const knownDocs = documentIdsInContext(input.context);
  const facts = input.acceptedFacts.facts as WireReaderFact[];
  const createdAt = input.createdAt ?? new Date().toISOString();

  for (let index = 0; index < facts.length; index += 1) {
    const fact = facts[index]!;
    const readerFactId = readerFactIdFromWire(fact, index);

    if (!isVerifiedReaderFact(fact, { fromReaderAcceptedFactsArtifact: true })) {
      quarantine(
        quarantined,
        index,
        fact,
        "UNVERIFIED_READER_FACT",
        "Accepted observation requires verified provenance.",
      );
      continue;
    }

    const predicate = input.packNormalizer.resolvePredicateTypeId(fact);
    if (!predicate.ok) {
      quarantine(quarantined, index, fact, predicate.code, predicate.message);
      continue;
    }

    const value = claimValueFromWire(fact.value);
    if (!value) {
      quarantine(quarantined, index, fact, "INVALID_VALUE", "Reader fact value could not be normalized.");
      continue;
    }

    const evidenceWire = evidenceRefsFromWire(fact);
    if (evidenceWire.length === 0) {
      quarantine(
        quarantined,
        index,
        fact,
        "MISSING_EVIDENCE",
        "Reader fact has no quotable document evidence.",
      );
      continue;
    }

    const evidenceErrors = validateDocumentEvidenceRefs(
      input.context,
      readerFactId,
      evidenceWire,
      knownDocs,
      `facts[${index}]`,
      { requireAtLeastOne: true, requireLocator: true },
    );
    if (evidenceErrors.length > 0) {
      quarantine(
        quarantined,
        index,
        fact,
        evidenceErrors[0]?.code ?? "PROVENANCE_INVALID",
        evidenceErrors.map((issue) => issue.message).join("; "),
      );
      continue;
    }

    const evidenceRefs = toSnapshotEvidenceRefs(evidenceWire);
    const role = input.packNormalizer.resolveObservationRole(fact, predicate.predicateTypeId);
    const unit = input.packNormalizer.resolveUnit(fact, predicate.predicateTypeId);
    const observedOn = observedOnFromWire(fact);
    const effectivePeriod = effectivePeriodFromWire(fact);

    const observation: SnapshotObservation = {
      id: stableObservationId({
        studyRunId: input.acceptedFacts.studyRunId,
        attemptId: input.acceptedFacts.attemptId,
        readerFactId,
        predicateTypeId: predicate.predicateTypeId,
        value,
        evidenceSignature: evidenceSignature(evidenceRefs),
      }),
      readerFactId,
      predicateTypeId: predicate.predicateTypeId,
      value,
      unit,
      role,
      observedOn,
      effectivePeriod,
      evidenceRefs,
      verificationStatus: "verified",
    };
    accepted.push(observation);
  }

  accepted.sort((a, b) => a.id.localeCompare(b.id));

  if (accepted.length === 0) {
    return { snapshot: null, accepted, quarantined, empty: true };
  }

  const bodyWithoutDigest = {
    schemaVersion: OBSERVATION_SNAPSHOT_SCHEMA_VERSION,
    studyRunId: input.acceptedFacts.studyRunId,
    attemptId: input.acceptedFacts.attemptId,
    caseId: input.acceptedFacts.caseId,
    domainId: input.domainId,
    packPin: input.packPin,
    source: {
      schemaVersion: "reader-accepted-facts/1" as const,
      studyRunId: input.acceptedFacts.studyRunId,
      attemptId: input.acceptedFacts.attemptId,
      promptSha256: input.acceptedFacts.promptSha256,
    },
    createdAt,
    observations: accepted,
  };

  const contentDigest = hashCanonicalJson(bodyWithoutDigest);
  const snapshot: ObservationSnapshot = {
    ...bodyWithoutDigest,
    contentDigest,
  };

  const validation = validateObservationSnapshot(snapshot);
  if (!validation.ok) {
    return {
      snapshot: null,
      accepted: [],
      quarantined: [
        ...quarantined,
        {
          index: -1,
          readerFactId: null,
          code: "SNAPSHOT_CONTRACT_INVALID",
          message: validation.errors.map((issue) => issue.message).join("; "),
          fact: {},
        },
      ],
      empty: true,
    };
  }

  return { snapshot: validation.value, accepted, quarantined, empty: false };
}

export const verifiedReaderToObservationSnapshotAdapter = {
  schemaVersion: OBSERVATION_SNAPSHOT_ADAPTER_SCHEMA_VERSION,
  supportedSourceSchemaVersions: ["reader-accepted-facts/1"] as const,
};
