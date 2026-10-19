import { describe, expect, it } from "vitest";

import {
  CANONICAL_STUDY_GRAPH_SCHEMA_VERSION,
  CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION,
  OBSERVATION_SNAPSHOT_SCHEMA_VERSION,
} from "./types.js";
import {
  isAbsenceFindingAcceptable,
  validateAcceptedCanonicalStudyGraph,
  validateCanonicalStudyGraphValidationResult,
  validateCanonicalStudyProjectionManifest,
  validateCanonicalStudyReasonerProposal,
  validateObservationSnapshot,
} from "./validate.js";
import { VALIDATOR_ACCEPTANCE_RULES } from "./validator-issue-codes.js";
import { describeGraphPersistenceSlots } from "./run-lifecycle.js";

const digest = "a".repeat(64);

function evidence(id: string) {
  return {
    id,
    sourceDocumentId: "doc-1",
    logicalDocumentId: "ld-1",
    sourceType: "document" as const,
    page: 1,
    snippet: "quoted text",
  };
}

function minimalObservationSnapshot() {
  return {
    schemaVersion: OBSERVATION_SNAPSHOT_SCHEMA_VERSION,
    studyRunId: "run-1",
    attemptId: "attempt-1",
    caseId: "case-1",
    domainId: "iep",
    packPin: {
      packId: "iep",
      packVersion: "0.2.1",
      packContentSha256: digest,
    },
    source: {
      schemaVersion: "reader-accepted-facts/1" as const,
      studyRunId: "run-1",
      attemptId: "attempt-1",
      promptSha256: digest,
    },
    createdAt: "2026-10-18T00:00:00.000Z",
    contentDigest: digest,
    observations: [
      {
        id: "obs-1",
        readerFactId: "fact-1",
        predicateTypeId: "measurement.rate",
        value: { kind: "quantity" as const, amount: 42 },
        unit: "WCPM",
        role: "baseline" as const,
        evidenceRefs: [evidence("ev-1")],
        verificationStatus: "verified" as const,
      },
    ],
  };
}

describe("canonical-study-graph contracts", () => {
  it("validates observation snapshot from reader-accepted-facts lineage", () => {
    const result = validateObservationSnapshot(minimalObservationSnapshot());
    expect(result.ok).toBe(true);
  });

  it("rejects non-verified observations in snapshot", () => {
    const snapshot = minimalObservationSnapshot();
    const broken = {
      ...snapshot,
      observations: [
        {
          ...snapshot.observations[0]!,
          verificationStatus: "pending" as "verified",
        },
      ],
    };
    const result = validateObservationSnapshot(broken);
    expect(result.ok).toBe(false);
  });

  it("validates reasoner proposal and absence scope shape", () => {
    const proposal = {
      schemaVersion: CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION,
      studyRunId: "run-1",
      attemptId: "attempt-1",
      packPin: minimalObservationSnapshot().packPin,
      modelPin: {
        providerId: "openai",
        modelId: "gpt-test",
        promptId: "canonical-reasoner",
        promptVersion: "1",
        promptSha256: digest,
      },
      observables: [
        {
          id: "ob-1",
          typeId: "person.student",
          label: "Student",
          identityStatus: "resolved" as const,
          observationIds: ["obs-1"],
        },
      ],
      observationLinks: [{ observationId: "obs-1", observableId: "ob-1" }],
      relationships: [],
      resolutions: [],
      candidateConflicts: [],
      candidateFindings: [
        {
          id: "find-abs-1",
          kind: "absence" as const,
          description: "No goal present for construct X in scoped documents",
          supportingObservationIds: [],
          absenceScope: {
            documentCoverageEstablished: false,
            searchScopeDeclared: true,
            searchScope: {
              observableTypeIds: ["goal"],
              relationshipTypeIds: [],
              documentScopeIds: ["ld-current-iep"],
            },
          },
        },
      ],
      unresolved: [],
    };
    expect(validateCanonicalStudyReasonerProposal(proposal).ok).toBe(true);
    expect(isAbsenceFindingAcceptable(proposal.candidateFindings[0]!)).toBe(false);
  });

  it("validates accepted graph and projection manifest as derived read-only", () => {
    const graph = {
      schemaVersion: CANONICAL_STUDY_GRAPH_SCHEMA_VERSION,
      studyRunId: "run-1",
      attemptId: "attempt-1",
      caseId: "case-1",
      domainId: "iep",
      packPin: minimalObservationSnapshot().packPin,
      modelPin: {
        providerId: "openai",
        modelId: "gpt-test",
        promptId: "canonical-reasoner",
        promptVersion: "1",
        promptSha256: digest,
      },
      observationSnapshotDigest: digest,
      createdAt: "2026-10-18T00:00:00.000Z",
      contentDigest: digest,
      observables: [
        {
          id: "ob-1",
          typeId: "person.student",
          label: "Student",
          identityStatus: "resolved" as const,
          observationIds: ["obs-1"],
          validationOutcome: "accepted" as const,
        },
      ],
      observations: minimalObservationSnapshot().observations,
      relationships: [],
      resolutions: [],
      conflicts: [],
      findings: [],
      unresolved: [],
    };
    expect(validateAcceptedCanonicalStudyGraph(graph).ok).toBe(true);

    const manifest = {
      schemaVersion: "hive.canonical-study-projection-manifest/1" as const,
      studyRunId: "run-1",
      attemptId: "attempt-1",
      sourceGraphDigest: digest,
      projectionKind: "case-intelligence/3" as const,
      projectionSchemaVersion: "case-intelligence/3",
      derivedAt: "2026-10-18T00:00:00.000Z",
      contentDigest: digest,
      lineage: {
        graphSchemaVersion: CANONICAL_STUDY_GRAPH_SCHEMA_VERSION,
        observableIds: ["ob-1"],
        findingIds: [],
      },
    };
    expect(validateCanonicalStudyProjectionManifest(manifest).ok).toBe(true);
  });

  it("documents validator acceptance rules and persistence slots", () => {
    expect(VALIDATOR_ACCEPTANCE_RULES.length).toBeGreaterThanOrEqual(4);
    const snapshot = minimalObservationSnapshot();
    const slots = describeGraphPersistenceSlots({ observationSnapshot: snapshot });
    expect(slots.observationSnapshot.schemaVersion).toBe(OBSERVATION_SNAPSHOT_SCHEMA_VERSION);
    expect(slots.acceptedGraph.schemaVersion).toBe(CANONICAL_STUDY_GRAPH_SCHEMA_VERSION);
  });

  it("validates graph validation result envelope", () => {
    const envelope = {
      schemaVersion: "canonical-study-graph-validation/1" as const,
      studyRunId: "run-1",
      attemptId: "attempt-1",
      status: "NEEDS_REVIEW" as const,
      accepted: {
        observables: [],
        relationships: [],
        resolutions: [],
        conflicts: [],
        findings: [],
      },
      rejected: [],
      unresolved: [
        {
          layer: "L3" as const,
          code: "ABSENCE_SCOPE_NOT_ESTABLISHED",
          severity: "reject" as const,
          message: "Absence scope not established",
        },
      ],
    };
    expect(validateCanonicalStudyGraphValidationResult(envelope).ok).toBe(true);
  });
});
