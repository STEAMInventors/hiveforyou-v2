import type { HiveDiscoverProposalV2, HiveDiscoverValidationResult } from "@hiveforyou/shared/discover";
import { HIVE_DISCOVER_PROPOSAL_SCHEMA_V2 } from "@hiveforyou/shared/discover";

import type { DiscoverSourceDocumentInput } from "../types.js";
import { validateDomainGroupsV2 } from "../validate-domain-groups-v2.js";
import { validateStructuralDiscoveryProposal } from "../validate-structural-proposal.js";
import { buildDiscoverPackCompliance } from "./build-discover-pack-compliance.js";
import type { DiscoverMappingPackContext, DiscoverMappingPackValidationOutcome } from "./types.js";

const UNCLASSIFIED_DOCUMENT_TYPE = "Document (unclassified)";

function isProposalV2Shape(value: unknown): value is HiveDiscoverProposalV2 {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (value as { schemaVersion?: string }).schemaVersion === HIVE_DISCOVER_PROPOSAL_SCHEMA_V2;
}

/** Mapping-pack path: preserve useful labels without rewriting to unclassified. */
export function preserveUnlistedDocumentTypesForMappingPack(
  proposal: HiveDiscoverProposalV2,
  context: DiscoverMappingPackContext,
): HiveDiscoverProposalV2 {
  const allowed = new Set(context.discoverView.documentTypes);
  return {
    ...proposal,
    logicalDocuments: proposal.logicalDocuments.map((doc) => {
      const label = doc.documentType?.trim() ?? "";
      if (!label || label === UNCLASSIFIED_DOCUMENT_TYPE) {
        return doc;
      }
      if (doc.domainId && doc.domainId !== context.discoverView.domainId) {
        if (doc.recognitionStatus === "ambiguous" || doc.recognitionStatus === "unrecognized") {
          return doc;
        }
        return { ...doc, recognitionStatus: "proposed_type" as const };
      }
      if (allowed.has(label)) {
        return doc;
      }
      if (doc.recognitionStatus === "ambiguous" || doc.recognitionStatus === "unrecognized") {
        return doc;
      }
      return {
        ...doc,
        documentType: label,
        domainId: doc.domainId ?? context.discoverView.domainId,
        recognitionStatus: "proposed_type",
      };
    }),
  };
}

export function validateDiscoveryProposalWithMappingPack(
  raw: unknown,
  sources: DiscoverSourceDocumentInput[],
  context: DiscoverMappingPackContext,
): DiscoverMappingPackValidationOutcome {
  if (!isProposalV2Shape(raw)) {
    const validation: HiveDiscoverValidationResult = {
      ok: false,
      issues: [
        {
          code: "MALFORMED_PROPOSAL",
          message: "Proposal is missing or has an invalid v2 schema version.",
        },
      ],
    };
    return {
      validation,
      compliance: buildDiscoverPackCompliance({
        context,
        proposal: {
          schemaVersion: HIVE_DISCOVER_PROPOSAL_SCHEMA_V2,
          domainResolution: { status: "UNRESOLVED", domainLabel: "Unknown" },
          domainGroups: [],
          logicalDocuments: [],
          relationships: [],
        },
        validation,
      }),
    };
  }

  if ("missingExpectedDocuments" in raw) {
    const validation: HiveDiscoverValidationResult = {
      ok: false,
      issues: [
        {
          code: "MALFORMED_PROPOSAL",
          message: "V2 proposals must not include model-authored missing documents.",
          path: "missingExpectedDocuments",
        },
      ],
      preservedDomainResolutionStatus: raw.domainResolution.status,
    };
    return {
      validation,
      compliance: buildDiscoverPackCompliance({ context, proposal: raw, validation }),
    };
  }

  const allowedTypes = new Set(context.discoverView.documentTypes);
  const recognizedPackIssues: HiveDiscoverValidationResult["issues"] = [];
  for (const doc of raw.logicalDocuments) {
    if (doc.recognitionStatus !== "recognized") {
      continue;
    }
    const label = doc.documentType?.trim() ?? "";
    if (!label || allowedTypes.has(label)) {
      continue;
    }
    recognizedPackIssues.push({
      code: "UNKNOWN_VOCABULARY",
      message: `Recognized documentType is not in compiled mapping pack: ${label}`,
      path: `logicalDocuments/${doc.id}/documentType`,
    });
  }
  if (recognizedPackIssues.length > 0) {
    const validation: HiveDiscoverValidationResult = {
      ok: false,
      issues: recognizedPackIssues,
      preservedDomainResolutionStatus: raw.domainResolution.status,
    };
    const proposal = preserveUnlistedDocumentTypesForMappingPack(raw, context);
    return {
      validation,
      compliance: buildDiscoverPackCompliance({ context, proposal, validation }),
    };
  }

  const proposal = preserveUnlistedDocumentTypesForMappingPack(raw, context);

  const structural = validateStructuralDiscoveryProposal(
    {
      domainResolution: proposal.domainResolution,
      logicalDocuments: proposal.logicalDocuments,
      relationships: proposal.relationships,
    },
    sources,
    context.packSnapshot,
    {
      packByDomainId: (domainId) =>
        domainId === context.discoverView.domainId ? context.packSnapshot : null,
    },
  );

  if (!structural.ok) {
    return {
      validation: structural,
      compliance: buildDiscoverPackCompliance({ context, proposal, validation: structural }),
    };
  }

  const domainGroupIssues = validateDomainGroupsV2(proposal);
  if (domainGroupIssues.length > 0) {
    const validation: HiveDiscoverValidationResult = {
      ok: false,
      issues: domainGroupIssues,
      preservedDomainResolutionStatus: proposal.domainResolution.status,
    };
    return {
      validation,
      compliance: buildDiscoverPackCompliance({ context, proposal, validation }),
    };
  }

  return {
    validation: structural,
    compliance: buildDiscoverPackCompliance({ context, proposal, validation: structural }),
  };
}
