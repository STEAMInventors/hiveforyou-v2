import { describe, expect, it } from "vitest";

import { requireDiscoverPack } from "@hiveforyou/domain-packs";

const BANKRUPTCY_DISCOVER_PACK = requireDiscoverPack("bankruptcy");
const IEP_DISCOVER_PACK = requireDiscoverPack("iep");
import type { HiveDiscoverProposalV2 } from "@hiveforyou/shared/discover";
import { HIVE_DISCOVER_PROPOSAL_SCHEMA_V2 } from "@hiveforyou/shared/discover";

import { validateCollectionUnderstandingV2 } from "./validate-collection-understanding-v2";
import { validateDiscoveryProposalV2 } from "./validate-discovery-proposal-v2";

const sources = [
  { sourceDocumentId: "src-1", originalFilename: "a.pdf", sizeBytes: 1 },
  { sourceDocumentId: "src-2", originalFilename: "b.pdf", sizeBytes: 1 },
  { sourceDocumentId: "src-3", originalFilename: "c.pdf", sizeBytes: 1 },
];

type DomainGroupDraft = Omit<
  HiveDiscoverProposalV2["domainGroups"][number],
  "suggestedObjectives" | "suggestedAudiences"
> &
  Partial<
    Pick<
      HiveDiscoverProposalV2["domainGroups"][number],
      "suggestedObjectives" | "suggestedAudiences"
    >
  >;

function baseProposal(
  overrides: Omit<Partial<HiveDiscoverProposalV2>, "domainGroups"> & {
    domainResolution: HiveDiscoverProposalV2["domainResolution"];
    domainGroups: DomainGroupDraft[];
    logicalDocuments: HiveDiscoverProposalV2["logicalDocuments"];
  },
): HiveDiscoverProposalV2 {
  const proposal: HiveDiscoverProposalV2 = {
    schemaVersion: HIVE_DISCOVER_PROPOSAL_SCHEMA_V2,
    relationships: [],
    ambiguityCandidates: [],
    clarificationQuestions: [],
    ...overrides,
    domainGroups: overrides.domainGroups.map((group) => ({
      ...group,
      suggestedObjectives: group.suggestedObjectives ?? [
        { id: "o1", label: "A", summary: "a" },
        { id: "o2", label: "B", summary: "b" },
        { id: "o3", label: "C", summary: "c" },
      ],
      suggestedAudiences: group.suggestedAudiences ?? [
        { id: "a1", label: "Just for me", roleHint: "self" },
      ],
    })),
  };
  return proposal;
}

describe("validateCollectionUnderstandingV2 domainGroups", () => {
  it("passes SINGLE_DOMAIN with one IEP domain group and pack categories on logical documents", () => {
    const result = validateCollectionUnderstandingV2(
      baseProposal({
        domainResolution: {
          status: "SINGLE_DOMAIN",
          domainLabel: IEP_DISCOVER_PACK.domainLabel,
          candidateDomainLabels: null,
        },
        domainGroups: [
          {
            id: "iep",
            domainId: "iep",
            domainLabel: IEP_DISCOVER_PACK.domainLabel,
            logicalDocumentIds: ["doc-e1", "doc-e2", "doc-p1"],
            description: "Special education records",
          },
        ],
        logicalDocuments: [
          {
            id: "doc-e1",
            domainId: "iep",
            sourceDocumentId: "src-1",
            pageStart: 1,
            pageEnd: null,
            documentType: "Psychoeducational evaluation",
            title: "Eval 1",
            documentDate: null,
            familyRole: "Evaluation report",
            groupId: "evaluations",
            recognitionStatus: "recognized",
            sequenceOrder: null,
          },
          {
            id: "doc-e2",
            domainId: "iep",
            sourceDocumentId: "src-2",
            pageStart: 1,
            pageEnd: null,
            documentType: "Psychoeducational evaluation",
            title: "Eval 2",
            documentDate: null,
            familyRole: "Evaluation report",
            groupId: "evaluations",
            recognitionStatus: "recognized",
            sequenceOrder: null,
          },
          {
            id: "doc-p1",
            domainId: "iep",
            sourceDocumentId: "src-3",
            pageStart: 1,
            pageEnd: null,
            documentType: "Individualized Education Program",
            title: "IEP",
            documentDate: null,
            familyRole: "Service plan",
            groupId: "planning",
            recognitionStatus: "recognized",
            sequenceOrder: null,
          },
        ],
      }),
      sources,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects duplicate domainGroups for the same domainId", () => {
    const result = validateCollectionUnderstandingV2(
      baseProposal({
        domainResolution: {
          status: "SINGLE_DOMAIN",
          domainLabel: IEP_DISCOVER_PACK.domainLabel,
          candidateDomainLabels: null,
        },
        domainGroups: [
          {
            id: "evaluations",
            domainId: "iep",
            domainLabel: IEP_DISCOVER_PACK.domainLabel,
            logicalDocumentIds: ["doc-e1"],
            description: "Evaluation records",
          },
          {
            id: "planning",
            domainId: "iep",
            domainLabel: IEP_DISCOVER_PACK.domainLabel,
            logicalDocumentIds: ["doc-p1"],
            description: "Planning records",
          },
        ],
        logicalDocuments: [
          {
            id: "doc-e1",
            domainId: "iep",
            sourceDocumentId: "src-1",
            pageStart: 1,
            pageEnd: null,
            documentType: "Psychoeducational evaluation",
            title: "Eval",
            documentDate: null,
            familyRole: "Evaluation report",
            groupId: "evaluations",
            recognitionStatus: "recognized",
            sequenceOrder: null,
          },
          {
            id: "doc-p1",
            domainId: "iep",
            sourceDocumentId: "src-2",
            pageStart: 1,
            pageEnd: null,
            documentType: "Individualized Education Program",
            title: "IEP",
            documentDate: null,
            familyRole: "Service plan",
            groupId: "planning",
            recognitionStatus: "recognized",
            sequenceOrder: null,
          },
        ],
      }),
      sources,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects legacy documentGroups wire field", () => {
    const proposal = baseProposal({
      domainResolution: {
        status: "SINGLE_DOMAIN",
        domainLabel: IEP_DISCOVER_PACK.domainLabel,
        candidateDomainLabels: null,
      },
      domainGroups: [
        {
          id: "iep",
          domainId: "iep",
          domainLabel: IEP_DISCOVER_PACK.domainLabel,
          logicalDocumentIds: ["doc-e1"],
          description: "IEP",
        },
      ],
      logicalDocuments: [
        {
          id: "doc-e1",
          domainId: "iep",
          sourceDocumentId: "src-1",
          pageStart: 1,
          pageEnd: null,
          documentType: "Individualized Education Program",
          title: "IEP",
          documentDate: null,
          familyRole: "Service plan",
          groupId: "planning",
          recognitionStatus: "recognized",
          sequenceOrder: null,
        },
      ],
    });
    const { domainGroups, ...rest } = proposal;
    const legacy = { ...rest, documentGroups: domainGroups };
    const result = validateCollectionUnderstandingV2(legacy, sources);
    expect(result.ok).toBe(false);
  });

  it("fails SINGLE_DOMAIN when domain groups span IEP and bankruptcy", () => {
    const result = validateCollectionUnderstandingV2(
      baseProposal({
        domainResolution: {
          status: "SINGLE_DOMAIN",
          domainLabel: IEP_DISCOVER_PACK.domainLabel,
          candidateDomainLabels: null,
        },
        domainGroups: [
          {
            id: "iep",
            domainId: "iep",
            domainLabel: IEP_DISCOVER_PACK.domainLabel,
            logicalDocumentIds: ["doc-iep"],
            description: "IEP",
          },
          {
            id: "bankruptcy",
            domainId: "bankruptcy",
            domainLabel: BANKRUPTCY_DISCOVER_PACK.domainLabel,
            logicalDocumentIds: ["doc-bk"],
            description: "Bankruptcy",
          },
        ],
        logicalDocuments: [
          {
            id: "doc-iep",
            domainId: "iep",
            sourceDocumentId: "src-1",
            pageStart: 1,
            pageEnd: null,
            documentType: "Individualized Education Program",
            title: "IEP",
            documentDate: null,
            familyRole: "Service plan",
            groupId: "planning",
            recognitionStatus: "recognized",
            sequenceOrder: null,
          },
          {
            id: "doc-bk",
            domainId: "bankruptcy",
            sourceDocumentId: "src-2",
            pageStart: 1,
            pageEnd: null,
            documentType: "Petition",
            title: "Petition",
            documentDate: null,
            familyRole: "Court filing",
            groupId: "uploads",
            recognitionStatus: "recognized",
            sequenceOrder: null,
          },
        ],
      }),
      sources,
    );
    expect(result.ok).toBe(false);
  });

  it("passes MULTI_DOMAIN with exactly two domain groups", () => {
    const result = validateCollectionUnderstandingV2(
      baseProposal({
        domainResolution: {
          status: "MULTI_DOMAIN",
          domainLabel: "Multiple domains",
          candidateDomainLabels: [
            IEP_DISCOVER_PACK.domainLabel,
            BANKRUPTCY_DISCOVER_PACK.domainLabel,
          ],
        },
        domainGroups: [
          {
            id: "iep",
            domainId: "iep",
            domainLabel: IEP_DISCOVER_PACK.domainLabel,
            logicalDocumentIds: ["doc-iep"],
            description: "IEP",
          },
          {
            id: "bankruptcy",
            domainId: "bankruptcy",
            domainLabel: BANKRUPTCY_DISCOVER_PACK.domainLabel,
            logicalDocumentIds: ["doc-bk"],
            description: "Bankruptcy",
          },
        ],
        logicalDocuments: [
          {
            id: "doc-iep",
            domainId: "iep",
            sourceDocumentId: "src-1",
            pageStart: 1,
            pageEnd: null,
            documentType: "Individualized Education Program",
            title: "IEP",
            documentDate: null,
            familyRole: "Service plan",
            groupId: "planning",
            recognitionStatus: "recognized",
            sequenceOrder: null,
          },
          {
            id: "doc-bk",
            domainId: "bankruptcy",
            sourceDocumentId: "src-2",
            pageStart: 1,
            pageEnd: null,
            documentType: "Petition",
            title: "Petition",
            documentDate: null,
            familyRole: "Court filing",
            groupId: "uploads",
            recognitionStatus: "recognized",
            sequenceOrder: null,
          },
        ],
      }),
      sources,
    );
    expect(result.ok).toBe(true);
  });

  it("accepts proposed_type document labels not in the pack vocabulary", () => {
    const result = validateDiscoveryProposalV2(
      baseProposal({
        domainResolution: {
          status: "SINGLE_DOMAIN",
          domainLabel: BANKRUPTCY_DISCOVER_PACK.domainLabel,
          candidateDomainLabels: null,
        },
        domainGroups: [
          {
            id: "bankruptcy",
            domainId: "bankruptcy",
            domainLabel: BANKRUPTCY_DISCOVER_PACK.domainLabel,
            logicalDocumentIds: ["doc-b1"],
            description: "Bankruptcy records",
          },
        ],
        logicalDocuments: [
          {
            id: "doc-b1",
            domainId: "bankruptcy",
            sourceDocumentId: "src-1",
            pageStart: 1,
            pageEnd: null,
            documentType: "Creditor matrix supplement",
            title: "Matrix supplement",
            documentDate: null,
            familyRole: "Supporting schedule",
            groupId: "uploads",
            recognitionStatus: "proposed_type",
            sequenceOrder: null,
          },
        ],
      }),
      [{ sourceDocumentId: "src-1", originalFilename: "a.pdf", sizeBytes: 1 }],
    );
    expect(result.ok).toBe(true);
  });

  it("keeps a useful type that is missing from a scaffold pack", () => {
    const proposal = baseProposal({
      domainResolution: {
        status: "SINGLE_DOMAIN",
        domainLabel: BANKRUPTCY_DISCOVER_PACK.domainLabel,
        candidateDomainLabels: null,
      },
      domainGroups: [
        {
          id: "bankruptcy",
          domainId: "bankruptcy",
          domainLabel: BANKRUPTCY_DISCOVER_PACK.domainLabel,
          logicalDocumentIds: ["doc-w2"],
          description: "Bankruptcy records",
        },
      ],
      logicalDocuments: [
        {
          id: "doc-w2",
          domainId: "bankruptcy",
          sourceDocumentId: "src-1",
          pageStart: 1,
          pageEnd: null,
          documentType: "W-2 Wage and Tax Statement",
          title: "W-2",
          documentDate: null,
          familyRole: "Wage statement",
          groupId: "uploads",
          recognitionStatus: "recognized",
          sequenceOrder: null,
        },
      ],
    });
    const result = validateDiscoveryProposalV2(proposal, [
      { sourceDocumentId: "src-1", originalFilename: "a.pdf", sizeBytes: 1 },
    ]);
    expect(result.ok).toBe(true);
    expect(proposal.logicalDocuments[0]?.documentType).toBe("W-2 Wage and Tax Statement");
    expect(proposal.logicalDocuments[0]?.domainId).toBe("bankruptcy");
    expect(proposal.logicalDocuments[0]?.recognitionStatus).toBe("proposed_type");
  });

  it("keeps a proposed domain that has no Domain Pack", () => {
    const proposal = baseProposal({
      domainResolution: {
        status: "MULTI_DOMAIN",
        domainLabel: "Multiple areas",
        candidateDomainLabels: ["Special education records", "Tax"],
      },
      domainGroups: [
        {
          id: "iep",
          domainId: "iep",
          domainLabel: IEP_DISCOVER_PACK.domainLabel,
          logicalDocumentIds: ["doc-iep"],
          description: "Special education records",
        },
        {
          id: "tax",
          domainId: "tax",
          domainLabel: "Tax",
          logicalDocumentIds: ["doc-w2"],
          description: "Tax records",
        },
      ],
      logicalDocuments: [
        {
          id: "doc-iep",
          domainId: "iep",
          sourceDocumentId: "src-1",
          pageStart: 1,
          documentType: "Individualized Education Program",
          title: "IEP",
          familyRole: "Service plan",
          groupId: "planning",
          recognitionStatus: "recognized",
        },
        {
          id: "doc-w2",
          domainId: "tax",
          sourceDocumentId: "src-2",
          pageStart: 1,
          documentType: "Form W-2 Wage and Tax Statement",
          title: "W-2",
          familyRole: "Wage and tax record",
          groupId: "uploads",
          recognitionStatus: "recognized",
        },
      ],
    });
    const result = validateCollectionUnderstandingV2(proposal, sources);
    expect(result.ok).toBe(true);
    expect(proposal.logicalDocuments[1]?.domainId).toBe("tax");
    expect(proposal.logicalDocuments[1]?.documentType).toBe("Form W-2 Wage and Tax Statement");
    expect(proposal.logicalDocuments[1]?.recognitionStatus).toBe("proposed_type");
  });
});
