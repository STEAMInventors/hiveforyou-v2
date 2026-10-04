import { describe, expect, it } from "vitest";

import { validateCanonicalStudyProposal } from "@hiveforyou/shared/case-intelligence/3";
import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V4,
  type CanonicalStudyProposalV4,
} from "@hiveforyou/shared/case-intelligence/4";

import { normalizeProposalV4ToV3 } from "./normalize-proposal-v4-to-v3";

describe("normalizeProposalV4ToV3", () => {
  it("strips null OpenAI transport fields from evidence refs for /3 contract", () => {
    const v4: CanonicalStudyProposalV4 = {
      schemaVersion: CANONICAL_STUDY_PROPOSAL_SCHEMA_V4,
      domainId: "iep",
      entities: [
        {
          id: "ent-1",
          entityType: "student",
          label: "Student",
          aliases: [],
          evidenceRefs: [
            {
              id: "ev-1",
              sourceDocumentId: "src-1",
              logicalDocumentId: null as unknown as undefined,
              page: 2,
              pageEnd: null as unknown as undefined,
              spanStart: null as unknown as undefined,
              spanEnd: null as unknown as undefined,
              quote: "Sample quote",
              extractionId: null as unknown as undefined,
              sourceType: "document",
            },
          ],
        },
      ],
      claims: [
        {
          id: "claim-1",
          subjectEntityId: "ent-1",
          construct: { measure: "eligibility_category", task: null, administration: null },
          value: { kind: "date", dateValue: "2024-01-15" },
          modality: "observed",
          evidenceRefs: [
            {
              id: "ev-2",
              sourceDocumentId: "src-1",
              logicalDocumentId: undefined,
              page: 2,
              quote: "Effective date",
              sourceType: "document",
            },
          ],
        },
      ],
      conflicts: [],
      missingInformation: [],
      modelMetadata: {
        providerId: "test",
        proposalMode: "fixture",
      },
      proposedAt: new Date().toISOString(),
    };

    const v3 = normalizeProposalV4ToV3(v4);
    const contract = validateCanonicalStudyProposal(v3);
    expect(contract.ok).toBe(true);
    expect(v3.claims[0]?.evidenceRefs[0]).not.toHaveProperty("logicalDocumentId");
  });

  it("omits null occurredOn and empty effectivePeriod for /3 contract", () => {
    const v4: CanonicalStudyProposalV4 = {
      schemaVersion: CANONICAL_STUDY_PROPOSAL_SCHEMA_V4,
      domainId: "iep",
      entities: [
        {
          id: "ent-1",
          entityType: "student",
          label: "Student",
          aliases: [],
          evidenceRefs: [
            {
              id: "ev-1",
              sourceDocumentId: "src-1",
              quote: "Quote",
              page: 1,
              sourceType: "document",
            },
          ],
        },
      ],
      claims: [
        {
          id: "claim-a",
          subjectEntityId: "ent-1",
          construct: { measure: "related_services", task: null, administration: null },
          value: { kind: "text", textValue: "Speech" },
          modality: "required",
          effectivePeriod: { start: null, end: null, precision: null },
          occurredOn: null as unknown as undefined,
          evidenceRefs: [
            {
              id: "ev-2",
              sourceDocumentId: "src-1",
              quote: "Services",
              page: 1,
              sourceType: "document",
            },
          ],
        },
        {
          id: "claim-b",
          subjectEntityId: "ent-1",
          construct: { measure: "service_frequency", task: null, administration: null },
          value: { kind: "text", textValue: "2x weekly" },
          modality: "planned",
          effectivePeriod: null as unknown as undefined,
          occurredOn: null as unknown as string,
          evidenceRefs: [
            {
              id: "ev-3",
              sourceDocumentId: "src-1",
              quote: "Frequency",
              page: 2,
              sourceType: "document",
            },
          ],
        },
      ],
      conflicts: [],
      missingInformation: [],
      modelMetadata: { providerId: "test", proposalMode: "fixture" },
      proposedAt: new Date().toISOString(),
    };

    const v3 = normalizeProposalV4ToV3(v4);
    expect(v3.claims[0]).not.toHaveProperty("occurredOn");
    expect(v3.claims[0]).not.toHaveProperty("effectivePeriod");
    expect(v3.claims[1]).not.toHaveProperty("occurredOn");
    expect(validateCanonicalStudyProposal(v3).ok).toBe(true);
  });
});
