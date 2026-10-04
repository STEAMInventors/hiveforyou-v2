import { getDiscoverPackByDomainId } from "@hiveforyou/domain-packs";
import type { HiveDiscoverProposalV2 } from "@hiveforyou/shared/discover";

import { HIVE_DISCOVER_PROPOSAL_SCHEMA_V2 } from "@hiveforyou/shared/discover";

import type { HiveDiscoverValidationResult } from "@hiveforyou/shared/discover";



import type { DiscoverSourceDocumentInput } from "./types";

import { validateStructuralDiscoveryProposal } from "./validate-structural-proposal";

import { resolveActiveDiscoverPack } from "./validate-discovery-proposal";

import { validateDomainGroupsV2 } from "./validate-domain-groups-v2";

const UNCLASSIFIED_DOCUMENT_TYPE = "Document (unclassified)";

/**
 * A useful model label stays even when the scaffold pack has no matching document type.
 * Status becomes proposed_type (not pack-recognized). The label is not rewritten to unclassified.
 */
export function preserveUnlistedDocumentTypes(proposal: HiveDiscoverProposalV2): HiveDiscoverProposalV2 {
  return {
    ...proposal,
    logicalDocuments: proposal.logicalDocuments.map((doc) => {
      const label = doc.documentType?.trim() ?? "";
      if (!label || label === UNCLASSIFIED_DOCUMENT_TYPE) {
        return doc;
      }
      const pack =
        typeof doc.domainId === "string" ? getDiscoverPackByDomainId(doc.domainId) : null;
      if (!pack) {
        if (doc.recognitionStatus === "ambiguous" || doc.recognitionStatus === "unrecognized") {
          return doc;
        }
        return {
          ...doc,
          documentType: label,
          domainId: doc.domainId,
          recognitionStatus: "proposed_type",
        };
      }
      if (pack.documentTypes.includes(label)) {
        return doc;
      }
      return {
        ...doc,
        documentType: label,
        domainId: doc.domainId,
        recognitionStatus: "proposed_type",
      };
    }),
  };
}



function isProposalV2Shape(value: unknown): value is HiveDiscoverProposalV2 {

  if (typeof value !== "object" || value === null) {

    return false;

  }

  return (value as { schemaVersion?: string }).schemaVersion === HIVE_DISCOVER_PROPOSAL_SCHEMA_V2;

}



export function validateDiscoveryProposalV2(

  raw: unknown,

  sources: DiscoverSourceDocumentInput[],

): HiveDiscoverValidationResult {

  if (!isProposalV2Shape(raw)) {

    return {

      ok: false,

      issues: [

        {

          code: "MALFORMED_PROPOSAL",

          message: "Proposal is missing or has an invalid v2 schema version.",

        },

      ],

    };

  }



  raw.logicalDocuments = preserveUnlistedDocumentTypes(raw).logicalDocuments;
  const proposal = raw;

  if ("missingExpectedDocuments" in proposal) {

    return {

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

  }



  const pack = resolveActiveDiscoverPack({

    schemaVersion: "hive-discover-proposal/1",

    domainResolution: proposal.domainResolution,

    logicalDocuments: proposal.logicalDocuments,

    relationships: proposal.relationships,

    missingExpectedDocuments: [],

  });



  const structural = validateStructuralDiscoveryProposal(

    {

      domainResolution: proposal.domainResolution,

      logicalDocuments: proposal.logicalDocuments,

      relationships: proposal.relationships,

    },

    sources,

    pack,

  );



  if (!structural.ok) {

    return structural;

  }



  const domainGroupIssues = validateDomainGroupsV2(proposal);

  if (domainGroupIssues.length > 0) {

    return {

      ok: false,

      issues: domainGroupIssues,

      preservedDomainResolutionStatus: raw.domainResolution.status,

    };

  }



  return structural;

}

