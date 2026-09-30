import { describe, expect, it } from "vitest";

import { BANKRUPTCY_DISCOVER_PACK, IEP_DISCOVER_PACK } from "@hiveforyou/domain-packs";
import type { CaseCustomerContextSnapshot } from "@hiveforyou/shared/case-customer-context";
import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";

import { buildDomainEngine2Workstream } from "./domain-workstream";
import { assertUniquePrimaryInventory } from "./map-structure-map-to-document-discovery";

const discovery: DocumentDiscoveryResult = {
  domainLabel: "Multiple domains",
  domainResolutionStatus: "provisional",
  groups: [],
  documents: [],
  relationships: [],
  missingDocuments: [],
  domainSections: [
    {
      domainId: "iep",
      domainLabel: IEP_DISCOVER_PACK.domainLabel,
      groups: IEP_DISCOVER_PACK.groups,
      documents: [
        {
          id: "iep-1",
          documentType: "Individualized Education Program",
          title: "IEP",
          originalFilename: "iep.pdf",
          sizeBytes: 1,
          familyRole: "Service plan",
          groupId: "planning",
          recognitionStatus: "recognized",
        },
      ],
      missingDocuments: [
        {
          id: "missing-pwn",
          expectedDocumentType: "Prior Written Notice",
          familyRole: "Meeting notice",
          groupId: "planning",
          reasonExpected: "Expected by the IEP pack.",
        },
      ],
    },
    {
      domainId: "bankruptcy",
      domainLabel: BANKRUPTCY_DISCOVER_PACK.domainLabel,
      groups: BANKRUPTCY_DISCOVER_PACK.groups,
      documents: [
        {
          id: "bk-w2",
          documentType: "W-2 Wage and Tax Statement",
          title: "W-2",
          originalFilename: "w2.pdf",
          sizeBytes: 1,
          familyRole: "Wage statement",
          groupId: "uploads",
          recognitionStatus: "proposed_type",
        },
      ],
      missingDocuments: [],
    },
  ],
};

const customerContext: CaseCustomerContextSnapshot = {
  source: "CUSTOMER_ASSERTION",
  domains: [
    {
      domainId: "iep",
      objective: "Prepare for an IEP meeting",
      objectiveCapturedAt: "2026-09-28T00:00:00.000Z",
      shareIntent: "yes",
      intendedAudience: {
        roleId: "school_team",
        label: "School/team",
        domainPackId: IEP_DISCOVER_PACK.domainPackId,
        domainPackVersion: IEP_DISCOVER_PACK.domainPackVersion,
      },
    },
    {
      domainId: "bankruptcy",
      objective: "Organize bankruptcy documents",
      objectiveCapturedAt: "2026-09-28T00:00:00.000Z",
      shareIntent: "yes",
      intendedAudience: {
        roleId: "generic.advisor",
        label: "Advisor",
        domainPackId: null,
        domainPackVersion: null,
      },
    },
  ],
};

describe("primary inventory", () => {
  it("rejects a logical document that would appear twice", () => {
    expect(() =>
      assertUniquePrimaryInventory([
        { documents: [{ id: "bk-w2" }] },
        { documents: [{ id: "bk-w2" }] },
      ]),
    ).toThrow("DUPLICATE_LOGICAL_DOCUMENT:bk-w2");
  });
});

describe("buildDomainEngine2Workstream", () => {
  it("sends the matching domain objective and documents without audience", () => {
    const workstream = buildDomainEngine2Workstream({
      domainId: "bankruptcy",
      documentDiscovery: discovery,
      customerContext,
      pack: BANKRUPTCY_DISCOVER_PACK,
    });
    expect(workstream.documents.map((doc) => doc.id)).toEqual(["bk-w2"]);
    expect(workstream.documents[0]?.documentType).toBe("W-2 Wage and Tax Statement");
    expect(workstream.customerContext).toEqual({
      source: "CUSTOMER_ASSERTION",
      domainId: "bankruptcy",
      objective: "Organize bankruptcy documents",
      objectiveCapturedAt: "2026-09-28T00:00:00.000Z",
    });
    expect(workstream.domainPackId).toBe(BANKRUPTCY_DISCOVER_PACK.domainPackId);
    expect(JSON.stringify(workstream.customerContext)).not.toContain("intendedAudience");
    expect(JSON.stringify(workstream.documents)).not.toContain("Advisor");
  });

  it("scopes missing requirements to the IEP workstream", () => {
    const workstream = buildDomainEngine2Workstream({
      domainId: "iep",
      documentDiscovery: discovery,
      customerContext,
      pack: IEP_DISCOVER_PACK,
    });
    expect(workstream.documents.map((doc) => doc.id)).toEqual(["iep-1"]);
    expect(workstream.customerContext?.objective).toBe("Prepare for an IEP meeting");
  });
});
