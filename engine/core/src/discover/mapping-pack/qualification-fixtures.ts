import { HIVE_DISCOVER_PROPOSAL_SCHEMA_V2 } from "@hiveforyou/shared/discover";
import type { HiveDiscoverProposalV2 } from "@hiveforyou/shared/discover";

import type { DiscoverSourceDocumentInput } from "../types.js";

export function qualificationSourcesForCase(caseId: string): DiscoverSourceDocumentInput[] {
  const normalized = caseId.trim().toLowerCase();
  if (normalized === "l001") {
    return [
      {
        sourceDocumentId: "l001-src-iep-001",
        originalFilename: "IEP_2024.pdf",
        pageCount: 42,
      },
      {
        sourceDocumentId: "l001-src-eval-002",
        originalFilename: "Psychoeducational_Evaluation.pdf",
        pageCount: 18,
      },
    ];
  }
  if (normalized === "bankruptcy") {
    return [
      {
        sourceDocumentId: "bankruptcy-src-petition-001",
        originalFilename: "chapter7_petition.pdf",
        pageCount: 12,
      },
    ];
  }
  if (normalized === "unknown") {
    return [
      {
        sourceDocumentId: "unknown-src-misc-001",
        originalFilename: "scan001.pdf",
        pageCount: 3,
      },
    ];
  }
  throw new Error(`Unknown discover qualification case: ${caseId}`);
}

export function qualificationProposalForCase(caseId: string): HiveDiscoverProposalV2 {
  const normalized = caseId.trim().toLowerCase();
  if (normalized === "l001") {
    return {
      schemaVersion: HIVE_DISCOVER_PROPOSAL_SCHEMA_V2,
      domainResolution: {
        status: "SINGLE_DOMAIN",
        domainLabel: "Individualized Education Program (IEP)",
      },
      domainGroups: [
        {
          id: "iep",
          domainId: "iep",
          domainLabel: "Individualized Education Program (IEP)",
          logicalDocumentIds: ["doc-iep", "doc-eval"],
          description: "Special education records (L001 qualification fixture)",
        },
      ],
      logicalDocuments: [
        {
          id: "doc-iep",
          sourceDocumentId: "l001-src-iep-001",
          pageStart: 1,
          pageEnd: 42,
          domainId: "iep",
          documentType: "Annual individualized education program",
          title: "Annual IEP",
          familyRole: "Uploaded file",
          groupId: "uploads",
          recognitionStatus: "recognized",
        },
        {
          id: "doc-eval",
          sourceDocumentId: "l001-src-eval-002",
          pageStart: 1,
          pageEnd: 18,
          domainId: "iep",
          documentType: "Psychoeducational evaluation report",
          title: "Psychoeducational evaluation",
          familyRole: "Uploaded file",
          groupId: "uploads",
          recognitionStatus: "recognized",
        },
      ],
      relationships: [],
    };
  }

  if (normalized === "bankruptcy" || normalized === "unknown") {
    const domainLabel =
      normalized === "bankruptcy" ? "Consumer bankruptcy" : "Unknown uploaded records";
    const source = qualificationSourcesForCase(normalized)[0]!;
    return {
      schemaVersion: HIVE_DISCOVER_PROPOSAL_SCHEMA_V2,
      domainResolution: {
        status: "UNRESOLVED",
        domainLabel,
      },
      domainGroups: [
        {
          id: "generic",
          domainId: "generic",
          domainLabel,
          logicalDocumentIds: ["doc-unclassified"],
          description: "Generic mapping pack qualification fixture (synthetic)",
        },
      ],
      logicalDocuments: [
        {
          id: "doc-unclassified",
          sourceDocumentId: source.sourceDocumentId,
          pageStart: 1,
          pageEnd: source.pageCount,
          domainId: "generic",
          documentType: "Document (unclassified)",
          title: source.originalFilename,
          familyRole: "Uploaded file",
          groupId: "uploads",
          recognitionStatus: "recognized",
        },
      ],
      relationships: [],
    };
  }

  throw new Error(`Unknown discover qualification case: ${caseId}`);
}

/** Proposal with a pack-invalid document type (recognized) for negative qualification tests. */
export function invalidDocumentTypeProposal(contextDomainId: string): HiveDiscoverProposalV2 {
  return {
    schemaVersion: HIVE_DISCOVER_PROPOSAL_SCHEMA_V2,
    domainResolution: {
      status: "SINGLE_DOMAIN",
      domainLabel: "Test domain",
    },
    domainGroups: [
      {
        id: contextDomainId,
        domainId: contextDomainId,
        domainLabel: "Test domain",
        logicalDocumentIds: ["doc-bad"],
        description: "Negative test fixture",
      },
    ],
    logicalDocuments: [
      {
        id: "doc-bad",
        sourceDocumentId: "l001-src-iep-001",
        pageStart: 1,
        domainId: contextDomainId,
        documentType: "Totally Fabricated Document Type XYZ",
        title: "Bad type",
        familyRole: "Uploaded file",
        groupId: "uploads",
        recognitionStatus: "recognized",
      },
    ],
    relationships: [],
  };
}
