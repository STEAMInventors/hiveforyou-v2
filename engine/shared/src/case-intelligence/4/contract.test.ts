import { describe, expect, it } from "vitest";

import { emptyVoiceProposal } from "../../projections/voice";

import { validateCanonicalStudyProposalV4 } from "./validate";
import type { CanonicalStudyProposalV4 } from "./types";

function minimalProposal(): CanonicalStudyProposalV4 {
  return {
    schemaVersion: "canonical-study-proposal/4",
    domainId: "iep",
    entities: [
      {
        id: "ent_1",
        entityType: "student",
        label: "Student",
        evidenceRefs: [
          {
            id: "ev_e1",
            sourceDocumentId: "doc_1",
            quote: "Student Name",
            sourceType: "document",
          },
        ],
      },
    ],
    claims: [
      {
        id: "clm_1",
        subjectEntityId: "ent_1",
        construct: { measure: "service_frequency", task: "speech_language_therapy" },
        value: { kind: "text", textValue: "2x weekly" },
        modality: "required",
        evidenceRefs: [
          {
            id: "ev_1",
            sourceDocumentId: "doc_1",
            page: 1,
            quote: "2x weekly",
            sourceType: "document",
          },
        ],
      },
    ],
    conflicts: [],
    missingInformation: [
      {
        id: "gap_1",
        description: "Prior written notice not in bundle.",
        gapKind: "not_found_in_supplied_documents",
        proposalLineage: { proposalItemId: "gap_1", studyRunId: "sr_1" },
      },
    ],
    voiceProposal: emptyVoiceProposal(),
    modelMetadata: { providerId: "test", proposalMode: "fixture" },
    proposedAt: new Date().toISOString(),
  };
}

describe("canonical-study-proposal/4 contract", () => {
  it("accepts a minimal valid proposal", () => {
    const result = validateCanonicalStudyProposalV4(minimalProposal());
    expect(result.ok).toBe(true);
  });

  it("rejects wrong schema version", () => {
    const proposal = { ...minimalProposal(), schemaVersion: "canonical-study-proposal/3" };
    const result = validateCanonicalStudyProposalV4(proposal);
    expect(result.ok).toBe(false);
  });
});
