import type { DiscoverDomainPackSnapshot } from "@hiveforyou/domain-packs";
import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";
import type { HiveDiscoverProposalV1 } from "@hiveforyou/shared/discover";

import type { DiscoverSourceDocumentInput } from "./types";

export function mapValidatedProposalToDocumentDiscovery(
  proposal: HiveDiscoverProposalV1,
  pack: DiscoverDomainPackSnapshot,
  sources: DiscoverSourceDocumentInput[],
): DocumentDiscoveryResult {
  const sourceById = new Map(sources.map((doc) => [doc.sourceDocumentId, doc]));
  const domainResolutionStatus =
    proposal.domainResolution.status === "RESOLVED" ? "resolved" : "provisional";

  return {
    domainLabel: proposal.domainResolution.domainLabel || pack.domainLabel,
    domainResolutionStatus,
    groups: structuredClone(pack.groups),
    documents: proposal.logicalDocuments.map((doc) => {
      const source = sourceById.get(doc.sourceDocumentId);
      return {
        id: doc.id,
        stagedDocumentId: doc.sourceDocumentId,
        documentType: doc.documentType,
        title: doc.title,
        documentDate: doc.documentDate,
        originalFilename: source?.originalFilename ?? "unknown",
        sizeBytes: source?.sizeBytes ?? 0,
        pageCount:
          doc.pageEnd != null
            ? doc.pageEnd - doc.pageStart + 1
            : undefined,
        familyRole: doc.familyRole,
        sequenceOrder: doc.sequenceOrder,
        groupId: doc.groupId,
        recognitionStatus: doc.recognitionStatus,
      };
    }),
    relationships: proposal.relationships.map((rel) => ({
      id: rel.id,
      fromDocumentId: rel.fromLogicalDocumentId,
      toDocumentId: rel.toLogicalDocumentId,
      kind: rel.kind,
      label: rel.label,
    })),
    missingDocuments: proposal.missingExpectedDocuments.map((missing) => ({
      id: missing.id,
      expectedDocumentType: missing.expectedDocumentType,
      familyRole: missing.familyRole,
      groupId: missing.groupId,
      reasonExpected: missing.reasonExpected,
      sequenceOrder: missing.sequenceOrder,
    })),
  };
}
