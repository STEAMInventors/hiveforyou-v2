import { describe, expect, it } from "vitest";

import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
  type CanonicalStudyProposal,
} from "@hiveforyou/shared/case-intelligence/3";
import { HIVE_STRUCTURE_MAP_SCHEMA } from "@hiveforyou/shared/discover";
import type { StructureMap } from "@hiveforyou/shared/discover";

import { enrichStudyContextWithStructureMap } from "./enrich-study-context";
import { freezeCanonicalStudyContext } from "./freeze-context";
import {
  FixtureCanonicalStudyEngineV3,
  createCanonicalStudyEngineV3FromEnv,
} from "./engine-v3";
import {
  isDomainPackConstructGatingIssue,
  validateCanonicalStudyProposalV3,
} from "./validate-proposal-v3";

function structureMap(): StructureMap {
  return {
    schemaVersion: HIVE_STRUCTURE_MAP_SCHEMA,
    discoverRunId: "discover-run-1",
    caseId: "case-v3-1",
    producedAt: new Date().toISOString(),
    domainResolution: {
      status: "SINGLE_DOMAIN",
      domainLabel: "Special education records",
      domainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
    },
    domainGroups: [],
    sourceDocuments: [
      {
        sourceDocumentId: "src-1",
        originalFilename: "iep.pdf",
        sizeBytes: 100,
      },
    ],
    logicalDocuments: [
      {
        id: "ld-1",
        domainId: "iep",
        sourceDocumentId: "src-1",
        pageStart: 1,
        pageEnd: 3,
        documentType: "Individualized Education Program",
        title: "IEP",
        familyRole: "plan",
        groupId: "planning",
        recognitionStatus: "recognized",
        provenance: "UPLOADED_EVIDENCE",
      },
    ],
    relationships: [],
    discoveryAnswers: [],
    unresolved: [],
    completeness: { status: "complete", expectations: [] },
    provenance: {
      promptVersion: "discover-v2",
      promptSha256: "test",
      providerId: "test",
    },
  };
}

function studyContext(studyRunId = "run-v3-1") {
  const pack = resolveDomainPackFromDiscoveryLabel("Special education records")!;
  const frozen = freezeCanonicalStudyContext({
    request: {
      caseId: "case-v3-1",
      discoveryRunId: "discover-run-1",
      sourceDocuments: [
        {
          stagedDocumentId: "src-1",
          sourceDocumentId: "src-1",
          originalFilename: "iep.pdf",
          sizeBytes: 100,
        },
      ],
      engine1Result: {
        domainLabel: "Special education records",
        domainResolutionStatus: "resolved",
        groups: [],
        documents: [],
        relationships: [],
        missingDocuments: [],
      },
      questionSet: { id: "qs", questions: [] },
      answerSnapshot: {
        questionSetId: "qs",
        answers: {},
        missingNodeStates: {},
        ambiguityNodeStates: {},
        analysisIntent: null,
        userContext: null,
      },
    },
    studyRunId,
    resolvedPack: pack,
    idempotencyKey: "key-v3",
    providerId: "fixture",
    providerMode: "fixture",
  });
  return enrichStudyContextWithStructureMap({
    context: frozen,
    structureMap: structureMap(),
    engine1Result: frozen.engine1Result,
  });
}

function baseProposal(overrides: Partial<CanonicalStudyProposal> = {}): CanonicalStudyProposal {
  const context = studyContext();
  const evidence = {
    id: "ev-1",
    sourceDocumentId: "src-1",
    logicalDocumentId: "ld-1",
    sourceType: "document" as const,
    page: 1,
  };
  return {
    schemaVersion: CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
    domainId: "iep",
    entities: [
      {
        id: "ent-1",
        entityType: "student",
        label: "Student",
        evidenceRefs: [evidence],
      },
      {
        id: "ent-2",
        entityType: "district",
        label: "District",
        evidenceRefs: [evidence],
      },
    ],
    claims: [
      {
        id: "claim-1",
        subjectEntityId: "ent-1",
        construct: "novel_dynamic_construct_xyz",
        value: { kind: "quantity", amount: 120 },
        role: "current",
        evidenceRefs: [evidence],
      },
      {
        id: "claim-2",
        subjectEntityId: "ent-1",
        construct: "linked_to",
        value: { kind: "entity_ref", entityId: "ent-2" },
        role: "observed",
        evidenceRefs: [evidence],
      },
    ],
    conflicts: [{ id: "conf-1", claimIds: ["claim-1", "claim-2"], kind: "other" }],
    missingInformation: [
      {
        id: "miss-1",
        description: "Prior evaluation not in set",
        proposalLineage: { proposalItemId: "miss-1", studyRunId: context.studyRunId },
      },
    ],
    modelMetadata: { providerId: "test", proposalMode: "fixture" },
    proposedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("validateCanonicalStudyProposalV3", () => {
  it("accepts schema-conforming proposal with novel construct", () => {
    const context = studyContext();
    const result = validateCanonicalStudyProposalV3(context, baseProposal());
    expect(result.status).toBe("SUCCEEDED");
    expect(result.accepted.claims.some((c) => c.construct === "novel_dynamic_construct_xyz")).toBe(
      true,
    );
  });

  it("rejects chipless factual claim", () => {
    const context = studyContext();
    const proposal = baseProposal({
      claims: [
        {
          id: "claim-bad",
          subjectEntityId: "ent-1",
          construct: "unsupported",
          value: { kind: "text", text: "x" },
          role: "unknown",
          evidenceRefs: [],
        },
      ],
    });
    const result = validateCanonicalStudyProposalV3(context, proposal);
    expect(result.rejected.some((r) => r.code === "PROVENANCE_MISSING")).toBe(true);
  });

  it("rejects invalid sourceDocumentId", () => {
    const context = studyContext();
    const proposal = baseProposal({
      entities: [
        {
          id: "ent-1",
          entityType: "student",
          label: "Student",
          evidenceRefs: [
            {
              id: "ev-bad",
              sourceDocumentId: "not-in-context",
              logicalDocumentId: "ld-1",
              sourceType: "document",
              page: 1,
            },
          ],
        },
      ],
      claims: [],
      conflicts: [],
      missingInformation: [
        {
          id: "miss-1",
          description: "gap",
          proposalLineage: { proposalItemId: "miss-1", studyRunId: context.studyRunId },
        },
      ],
    });
    const result = validateCanonicalStudyProposalV3(context, proposal);
    expect(result.rejected.some((r) => r.code === "UNKNOWN_SOURCE_DOCUMENT")).toBe(true);
  });

  it("rejects invalid logicalDocumentId when structure map exists", () => {
    const context = studyContext();
    const proposal = baseProposal({
      entities: [
        {
          id: "ent-1",
          entityType: "student",
          label: "Student",
          evidenceRefs: [
            {
              id: "ev-bad",
              sourceDocumentId: "src-1",
              logicalDocumentId: "ld-missing",
              sourceType: "document",
              page: 1,
            },
          ],
        },
      ],
      claims: [],
      conflicts: [],
    });
    const result = validateCanonicalStudyProposalV3(context, proposal);
    expect(result.rejected.some((r) => r.code === "UNKNOWN_LOGICAL_DOCUMENT")).toBe(true);
  });

  it("rejects page outside document bounds", () => {
    const context = studyContext();
    const proposal = baseProposal({
      claims: [
        {
          id: "claim-1",
          subjectEntityId: "ent-1",
          construct: "fact",
          value: { kind: "text", text: "x" },
          role: "observed",
          evidenceRefs: [
            {
              id: "ev-1",
              sourceDocumentId: "src-1",
              logicalDocumentId: "ld-1",
              sourceType: "document",
              page: 99,
            },
          ],
        },
      ],
      entities: baseProposal().entities,
    });
    const result = validateCanonicalStudyProposalV3(context, proposal);
    expect(result.rejected.some((r) => r.code === "EVIDENCE_PAGE_OUT_OF_RANGE")).toBe(true);
  });

  it("rejects entity_ref pointing outside proposed entities", () => {
    const context = studyContext();
    const proposal = baseProposal({
      claims: [
        {
          id: "claim-1",
          subjectEntityId: "ent-1",
          construct: "linked_to",
          value: { kind: "entity_ref", entityId: "ent-missing" },
          role: "observed",
          evidenceRefs: baseProposal().entities[0]!.evidenceRefs,
        },
      ],
    });
    const result = validateCanonicalStudyProposalV3(context, proposal);
    expect(result.rejected.some((r) => r.code === "INTEGRITY_ENTITY_REFERENCE")).toBe(true);
  });

  it("rejects conflict referencing unknown claim id", () => {
    const context = studyContext();
    const proposal = baseProposal({
      conflicts: [{ id: "c1", claimIds: ["claim-1", "claim-missing"], kind: "other" }],
    });
    const result = validateCanonicalStudyProposalV3(context, proposal);
    expect(result.rejected.some((r) => r.code === "INTEGRITY_CONFLICT_REFERENCE")).toBe(true);
  });

  it("keeps missing information separate from accepted claims", () => {
    const context = studyContext();
    const result = validateCanonicalStudyProposalV3(context, baseProposal());
    expect(result.accepted.missingInformation.length).toBe(1);
    expect(result.accepted.claims.every((c) => c.id !== "miss-1")).toBe(true);
  });

  it("does not apply domain pack construct gating", () => {
    const context = studyContext();
    const result = validateCanonicalStudyProposalV3(context, baseProposal());
    const gating = [...result.rejected, ...result.validationErrors].filter(
      isDomainPackConstructGatingIssue,
    );
    expect(gating).toHaveLength(0);
    expect(result.rejected.some((r) => r.code === "unrecognized_construct")).toBe(false);
  });

  it("validates fixture engine output through v3 path", async () => {
    const context = studyContext();
    const engine = new FixtureCanonicalStudyEngineV3();
    const proposal = await engine.study(context);
    const result = validateCanonicalStudyProposalV3(context, proposal);
    expect(result.status).toBe("SUCCEEDED");
    expect(
      result.accepted.claims.some((c) => c.construct === "weekly_specialized_instruction_minutes"),
    ).toBe(true);
  });

  it("createCanonicalStudyEngineV3FromEnv resolves fixture mode", () => {
    expect(createCanonicalStudyEngineV3FromEnv("fixture").mode).toBe("fixture");
  });
});
