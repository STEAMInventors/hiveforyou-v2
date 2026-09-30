import type { HiveDiscoverProposalV2 } from "@hiveforyou/shared/discover";

import type { HiveDiscoverValidationResult } from "@hiveforyou/shared/discover";



import type { DiscoverSourceDocumentInput } from "./types";

import { validateDiscoveryProposalV2 } from "./validate-discovery-proposal-v2";

import { validateDomainGroupsV2 } from "./validate-domain-groups-v2";



function rejectLegacyDocumentGroupsKey(raw: unknown): HiveDiscoverValidationResult | null {

  if (typeof raw !== "object" || raw === null) {

    return null;

  }

  if ("documentGroups" in raw && Array.isArray((raw as { documentGroups?: unknown }).documentGroups)) {

    return {

      ok: false,

      issues: [

        {

          code: "MALFORMED_PROPOSAL",

          message:

            "Use domainGroups for domain routing (one entry per domainId). Pack categories belong on logicalDocuments.groupId.",

          path: "documentGroups",

        },

      ],

    };

  }

  return null;

}



export function validateCollectionUnderstandingV2(

  raw: unknown,

  sources: DiscoverSourceDocumentInput[],

): HiveDiscoverValidationResult {

  const legacy = rejectLegacyDocumentGroupsKey(raw);

  if (legacy) {

    return legacy;

  }



  const structural = validateDiscoveryProposalV2(raw, sources);

  if (!structural.ok) {

    return structural;

  }



  const proposal = raw as HiveDiscoverProposalV2;

  const issues = [...validateDomainGroupsV2(proposal)];



  for (const group of proposal.domainGroups) {

    if (group.suggestedObjectives.length < 3 || group.suggestedObjectives.length > 5) {

      issues.push({

        code: "MALFORMED_PROPOSAL",

        message: "Each domain must propose 3–5 objectives.",

        path: `domainGroups/${group.id}/suggestedObjectives`,

      });

    }

  }



  if (proposal.clarificationQuestions.length > 0) {

    issues.push({

      code: "MALFORMED_PROPOSAL",

      message: "Collection understanding must not include clarification questions.",

      path: "clarificationQuestions",

    });

  }



  if (issues.length > 0) {

    return {

      ok: false,

      issues,

      preservedDomainResolutionStatus: proposal.domainResolution.status,

    };

  }



  return structural;

}

