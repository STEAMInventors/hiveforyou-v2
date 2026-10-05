import type { DiscoverDomainPackSnapshot } from "@hiveforyou/domain-packs";
import {
  getDiscoverPackByDomainLabel,
  listDiscoverDomainPacks,
} from "@hiveforyou/domain-packs";
import type {
  HiveDiscoverProposalV1,
  HiveDiscoverProposalV2,
  HiveDiscoverValidationResult,
} from "@hiveforyou/shared/discover";
import {
  HIVE_DISCOVER_PROPOSAL_SCHEMA,
  HIVE_DISCOVER_PROPOSAL_SCHEMA_V2,
} from "@hiveforyou/shared/discover";
import { validateDiscoveryProposalV2 } from "./validate-discovery-proposal-v2";

import type { DiscoverSourceDocumentInput } from "./types";

function isProposalShape(value: unknown): value is HiveDiscoverProposalV1 {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.schemaVersion === HIVE_DISCOVER_PROPOSAL_SCHEMA;
}

function buildUnionDiscoverPack(): DiscoverDomainPackSnapshot {
  const packs = listDiscoverDomainPacks();
  const first = packs[0]!;
  return {
    ...first,
    domainLabel: "Union",
    audienceRoles: undefined,
    documentTypes: [...new Set(packs.flatMap((item) => item.documentTypes))],
    familyRoles: [...new Set(packs.flatMap((item) => item.familyRoles))],
    groups: packs.flatMap((item) => item.groups),
    relationshipKinds: [...new Set(packs.flatMap((item) => item.relationshipKinds))],
    missingExpectations: packs.flatMap((item) => item.missingExpectations),
    catalog: packs.flatMap((item) => item.catalog),
  };
}

export function validateDiscoveryProposal(
  raw: unknown,
  sources: DiscoverSourceDocumentInput[],
): HiveDiscoverValidationResult {
  if (!isProposalShape(raw)) {
    return {
      ok: false,
      issues: [
        {
          code: "MALFORMED_PROPOSAL",
          message: "Proposal is missing or has an invalid schema version.",
        },
      ],
    };
  }

  const proposal = raw;
  const issues: HiveDiscoverValidationResult["issues"] = [];
  const sourceIds = new Set(sources.map((doc) => doc.sourceDocumentId));
  const resolvedPack = getDiscoverPackByDomainLabel(proposal.domainResolution.domainLabel);
  const pack =
    resolvedPack ??
    (proposal.domainResolution.status === "RESOLVED" ? null : buildUnionDiscoverPack());

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

    if (pack) {
      if (!pack.documentTypes.includes(doc.documentType)) {
        issues.push({
          code: "UNKNOWN_VOCABULARY",
          message: `Unknown documentType: ${doc.documentType}`,
          path: `logicalDocuments/${doc.id}/documentType`,
        });
      }
      if (!pack.familyRoles.includes(doc.familyRole)) {
        issues.push({
          code: "UNKNOWN_VOCABULARY",
          message: `Unknown familyRole: ${doc.familyRole}`,
          path: `logicalDocuments/${doc.id}/familyRole`,
        });
      }
      if (!pack.groups.some((group) => group.id === doc.groupId)) {
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

  if (pack) {
    const allowedExpectations = new Map(
      pack.missingExpectations.map((item) => [item.packExpectationId, item]),
    );
    for (const missing of proposal.missingExpectedDocuments) {
      const expected = allowedExpectations.get(missing.packExpectationId);
      if (!expected) {
        issues.push({
          code: "UNKNOWN_PACK_EXPECTATION",
          message: `Unknown packExpectationId: ${missing.packExpectationId}`,
          path: `missingExpectedDocuments/${missing.id}/packExpectationId`,
        });
        continue;
      }
      if (missing.expectedDocumentType !== expected.expectedDocumentType) {
        issues.push({
          code: "UNKNOWN_VOCABULARY",
          message: "Missing document type does not match pack expectation.",
          path: `missingExpectedDocuments/${missing.id}/expectedDocumentType`,
        });
      }
    }
  } else if (
    proposal.domainResolution.status === "RESOLVED" ||
    proposal.domainResolution.status === "SINGLE_DOMAIN"
  ) {
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

export function isHiveDiscoverProposalV1(raw: unknown): raw is HiveDiscoverProposalV1 {
  return isProposalShape(raw);
}

export function isHiveDiscoverProposalV2(raw: unknown): raw is HiveDiscoverProposalV2 {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  return (raw as { schemaVersion?: string }).schemaVersion === HIVE_DISCOVER_PROPOSAL_SCHEMA_V2;
}

export function validateDiscoverProposalOutput(
  raw: unknown,
  sources: DiscoverSourceDocumentInput[],
): HiveDiscoverValidationResult {
  if (isHiveDiscoverProposalV2(raw)) {
    return validateDiscoveryProposalV2(raw, sources);
  }
  return validateDiscoveryProposal(raw, sources);
}

export function resolveActiveDiscoverPack(
  proposal: HiveDiscoverProposalV1 | HiveDiscoverProposalV2,
): DiscoverDomainPackSnapshot | null {
  const singleDomain =
    proposal.domainResolution.status === "RESOLVED" ||
    proposal.domainResolution.status === "SINGLE_DOMAIN";
  return (
    getDiscoverPackByDomainLabel(proposal.domainResolution.domainLabel) ??
    (singleDomain ? null : buildUnionDiscoverPack())
  );
}
