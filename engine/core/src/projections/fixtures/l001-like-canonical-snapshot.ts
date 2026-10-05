import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";

/** L001-shaped v3 snapshot for qualitative Case Map projection tests (no live model). */
export function l001LikeCanonicalSnapshot(): CanonicalCaseSnapshot {
  return {
    schemaVersion: "case-intelligence/3",
    version: 1,
    caseId: "l001-case",
    studyRunId: "l001-run",
    createdAt: "2026-09-30T12:00:00.000Z",
    caseScope: "single_domain",
    domainId: "iep",
    domainPackId: "hive.domain.iep",
    domainPackVersion: "0.0.0-scaffold",
    entities: [
      {
        id: "entity-student",
        entityType: "person",
        label: "Alex M.",
        evidenceRefs: [
          {
            id: "ev-student",
            sourceDocumentId: "src-iep",
            logicalDocumentId: "ld-iep",
            sourceType: "document",
            page: 1,
          },
        ],
      },
    ],
    claims: [
      {
        id: "claim-eligibility",
        domainId: "iep",
        subjectEntityId: "entity-student",
        construct: "eligibility_status",
        value: { kind: "text", text: "Eligible for special education" },
        role: "current",
        occurredOn: "2024-03-15",
        evidenceRefs: [
          {
            id: "ev-elig",
            sourceDocumentId: "src-iep",
            logicalDocumentId: "ld-iep",
            sourceType: "document",
            page: 2,
            snippet: "Student is eligible",
          },
        ],
        proposalLineage: { proposalItemId: "claim-eligibility", studyRunId: "l001-run" },
      },
      {
        id: "claim-present-level",
        domainId: "iep",
        subjectEntityId: "entity-student",
        construct: "present_level_reading",
        value: { kind: "text", text: "Reads at mid-second-grade level" },
        role: "current",
        occurredOn: "2023-11-01",
        evidenceRefs: [
          {
            id: "ev-pl",
            sourceDocumentId: "src-iep",
            logicalDocumentId: "ld-iep",
            sourceType: "document",
            page: 4,
          },
        ],
        proposalLineage: { proposalItemId: "claim-present-level", studyRunId: "l001-run" },
      },
      {
        id: "claim-goal",
        domainId: "iep",
        subjectEntityId: "entity-student",
        construct: "annual_goal_reading",
        value: { kind: "text", text: "Improve decoding fluency" },
        role: "planned",
        evidenceRefs: [
          {
            id: "ev-goal",
            sourceDocumentId: "src-iep",
            logicalDocumentId: "ld-iep",
            sourceType: "document",
            page: 6,
          },
        ],
        proposalLineage: { proposalItemId: "claim-goal", studyRunId: "l001-run" },
      },
      {
        id: "claim-service",
        domainId: "iep",
        subjectEntityId: "entity-student",
        construct: "service_minutes",
        value: { kind: "quantity", amount: 120 },
        unit: "minutes per week",
        role: "planned",
        evidenceRefs: [
          {
            id: "ev-svc",
            sourceDocumentId: "src-iep",
            logicalDocumentId: "ld-iep",
            sourceType: "document",
            page: 8,
          },
        ],
        proposalLineage: { proposalItemId: "claim-service", studyRunId: "l001-run" },
      },
      {
        id: "claim-service-old",
        domainId: "iep",
        subjectEntityId: "entity-student",
        construct: "service_minutes",
        value: { kind: "quantity", amount: 90 },
        unit: "minutes per week",
        role: "superseded",
        effectivePeriod: { start: "2023-09-01", precision: "day" },
        evidenceRefs: [
          {
            id: "ev-svc-old",
            sourceDocumentId: "src-prior-iep",
            logicalDocumentId: "ld-prior-iep",
            sourceType: "document",
            page: 7,
          },
        ],
        proposalLineage: { proposalItemId: "claim-service-old", studyRunId: "l001-run" },
      },
      {
        id: "claim-novel",
        domainId: "iep",
        subjectEntityId: "entity-student",
        construct: "hive_unmapped_construct_beta",
        value: { kind: "text", text: "Unexpected but validated fact" },
        role: "observed",
        evidenceRefs: [
          {
            id: "ev-novel",
            sourceDocumentId: "src-eval",
            logicalDocumentId: "ld-eval",
            sourceType: "document",
            page: 3,
          },
        ],
        proposalLineage: { proposalItemId: "claim-novel", studyRunId: "l001-run" },
      },
    ],
    events: [
      {
        id: "event-iep-meeting",
        claimId: "claim-eligibility",
        construct: "eligibility_status",
        subjectEntityId: "entity-student",
        occurredOn: "2024-03-15",
        evidenceRefs: [
          {
            id: "ev-event",
            sourceDocumentId: "src-iep",
            logicalDocumentId: "ld-iep",
            sourceType: "document",
            page: 1,
          },
        ],
        timelineOrderHint: 2,
      },
      {
        id: "event-referral",
        claimId: "claim-present-level",
        construct: "present_level_reading",
        subjectEntityId: "entity-student",
        occurredOn: "2023-11-01",
        evidenceRefs: [
          {
            id: "ev-event-ref",
            sourceDocumentId: "src-eval",
            logicalDocumentId: "ld-eval",
            sourceType: "document",
            page: 1,
          },
        ],
        timelineOrderHint: 1,
      },
    ],
    conflicts: [
      {
        id: "conflict-minutes",
        claimIds: ["claim-service", "claim-service-old"],
        kind: "temporal_overlap",
        subjectEntityId: "entity-student",
        construct: "service_minutes",
      },
    ],
    changes: [
      {
        id: "change-service-minutes",
        subjectEntityId: "entity-student",
        construct: "service_minutes",
        fromClaimId: "claim-service-old",
        toClaimId: "claim-service",
      },
    ],
    unresolved: [
      {
        id: "gap-minutes-total",
        kind: "missing_information",
        source: "model_proposal",
        description: "Weekly service minutes total is referenced but not shown.",
        subjectEntityId: "entity-student",
        relatedConstruct: "service_minutes",
        evidenceRefs: [
          {
            id: "ev-gap",
            sourceDocumentId: "src-iep",
            logicalDocumentId: "ld-iep",
            sourceType: "document",
            page: 8,
            snippet: "see service grid",
          },
        ],
        proposalLineage: {
          proposalItemId: "gap-minutes-total",
          studyRunId: "l001-run",
        },
      },
    ],
    sourceDocuments: [
      {
        stagedDocumentId: "src-iep",
        sourceDocumentId: "src-iep",
        originalFilename: "iep.pdf",
        sizeBytes: 1000,
      },
    ],
    validationResult: {
      status: "SUCCEEDED",
      accepted: {
        entities: [],
        claims: [],
        conflicts: [],
        missingInformation: [],
      },
      rejected: [],
      warnings: [],
      unresolved: [],
      validationErrors: [],
      provenanceErrors: [],
      integrityErrors: [],
    },
  };
}
