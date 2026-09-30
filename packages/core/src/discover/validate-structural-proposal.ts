import type { DiscoverDomainPackSnapshot } from "@hiveforyou/domain-packs";
import { getDiscoverPackByDomainId } from "@hiveforyou/domain-packs";
import { isResolvedDomainStatus } from "@hiveforyou/shared/discover";
import type { HiveDiscoverValidationResult } from "@hiveforyou/shared/discover";
import type {
  HiveDiscoverProposalV1,
  ProposedLogicalDocument,
  ProposedDiscoverRelationship,
  ProposedDomainResolution,
} from "@hiveforyou/shared/discover";

import type { DiscoverSourceDocumentInput } from "./types";

export type StructuralProposalInput = {
  domainResolution: ProposedDomainResolution;
  logicalDocuments: ProposedLogicalDocument[];
  relationships: ProposedDiscoverRelationship[];
};

export function validateStructuralDiscoveryProposal(
  proposal: StructuralProposalInput,
  sources: DiscoverSourceDocumentInput[],
  pack: DiscoverDomainPackSnapshot | null,
): HiveDiscoverValidationResult {
  const issues: HiveDiscoverValidationResult["issues"] = [];
  const sourceIds = new Set(sources.map((doc) => doc.sourceDocumentId));

  const logicalIds = new Set<string>();
  for (const doc of proposal.logicalDocuments) {
    if (logicalIds.has(doc.id)) {
      issues.push({
        code: "DUPLICATE_LOGICAL_DOCUMENT_ID",
        message: `Duplicate logical document id: ${doc.id}`,
        path: `logicalDocuments/${doc.id}`,
      });
    }
    logicalIds.add(doc.id);

    if (!doc.sourceDocumentId?.trim()) {
      issues.push({
        code: "MISSING_PROVENANCE",
        message: "Logical document is missing sourceDocumentId.",
        path: `logicalDocuments/${doc.id}/sourceDocumentId`,
      });
    } else if (!sourceIds.has(doc.sourceDocumentId)) {
      issues.push({
        code: "UNKNOWN_SOURCE_DOCUMENT",
        message: `Unknown source document id: ${doc.sourceDocumentId}`,
        path: `logicalDocuments/${doc.id}/sourceDocumentId`,
      });
    }

    if (!Number.isInteger(doc.pageStart) || doc.pageStart < 1) {
      issues.push({
        code: "MISSING_PROVENANCE",
        message: "Logical document requires pageStart >= 1.",
        path: `logicalDocuments/${doc.id}/pageStart`,
      });
    }

    if (doc.pageEnd != null && doc.pageEnd < doc.pageStart) {
      issues.push({
        code: "MISSING_PROVENANCE",
        message: "pageEnd must be >= pageStart.",
        path: `logicalDocuments/${doc.id}/pageEnd`,
      });
    }

    const registeredPack =
      "domainId" in doc && typeof doc.domainId === "string" && doc.domainId.trim()
        ? getDiscoverPackByDomainId(doc.domainId)
        : undefined;
    const docPack =
      registeredPack !== undefined
        ? registeredPack
        : "domainId" in doc && typeof doc.domainId === "string" && doc.domainId.trim()
          ? null
          : pack;
    if (docPack) {
      const proposedType = doc.recognitionStatus === "proposed_type";
      if (proposedType) {
        if (!doc.documentType?.trim()) {
          issues.push({
            code: "MALFORMED_PROPOSAL",
            message: "proposed_type documents require a concise documentType label.",
            path: `logicalDocuments/${doc.id}/documentType`,
          });
        }
      } else if (!docPack.documentTypes.includes(doc.documentType)) {
        issues.push({
          code: "UNKNOWN_VOCABULARY",
          message: `Unknown documentType: ${doc.documentType}`,
          path: `logicalDocuments/${doc.id}/documentType`,
        });
      }
      if (!proposedType && !docPack.familyRoles.includes(doc.familyRole)) {
        issues.push({
          code: "UNKNOWN_VOCABULARY",
          message: `Unknown familyRole: ${doc.familyRole}`,
          path: `logicalDocuments/${doc.id}/familyRole`,
        });
      }
      if (
        doc.groupId.trim() &&
        !proposedType &&
        !docPack.groups.some((group) => group.id === doc.groupId)
      ) {
        issues.push({
          code: "UNKNOWN_VOCABULARY",
          message: `Unknown groupId: ${doc.groupId}`,
          path: `logicalDocuments/${doc.id}/groupId`,
        });
      }
    }
  }

  for (const rel of proposal.relationships) {
    if (!logicalIds.has(rel.fromLogicalDocumentId) || !logicalIds.has(rel.toLogicalDocumentId)) {
      issues.push({
        code: "INVALID_RELATIONSHIP",
        message: `Relationship ${rel.id} references unknown logical documents.`,
        path: `relationships/${rel.id}`,
      });
    }
    if (pack && !pack.relationshipKinds.includes(rel.kind)) {
      issues.push({
        code: "UNKNOWN_VOCABULARY",
        message: `Unknown relationship kind: ${rel.kind}`,
        path: `relationships/${rel.id}/kind`,
      });
    }
  }

  if (pack === null && isResolvedDomainStatus(proposal.domainResolution.status)) {
    issues.push({
      code: "UNKNOWN_VOCABULARY",
      message: `Unknown domain label: ${proposal.domainResolution.domainLabel}`,
      path: "domainResolution/domainLabel",
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      preservedDomainResolutionStatus: proposal.domainResolution.status,
    };
  }

  return {
    ok: true,
    issues: [],
    preservedDomainResolutionStatus: proposal.domainResolution.status,
  };
}

export function structuralInputFromV1(proposal: HiveDiscoverProposalV1): StructuralProposalInput {
  return {
    domainResolution: proposal.domainResolution,
    logicalDocuments: proposal.logicalDocuments,
    relationships: proposal.relationships,
  };
}
