import type { HiveDiscoverProposalV2 } from "@hiveforyou/shared/discover";

import type { DiscoverValidationIssue } from "@hiveforyou/shared/discover";



import { resolvedDomainId } from "./aggregate-domain-groups";



function uniqueResolvedDomainIds(proposal: HiveDiscoverProposalV2): Set<string> {

  const ids = new Set<string>();

  for (const group of proposal.domainGroups) {

    const domainId = resolvedDomainId(group.domainId);

    if (domainId) {

      ids.add(domainId);

    }

  }

  for (const doc of proposal.logicalDocuments) {

    if (typeof doc.domainId === "string") {

      const domainId = resolvedDomainId(doc.domainId);

      if (domainId) {

        ids.add(domainId);

      }

    }

  }

  return ids;

}



export function validateDomainGroupsV2(proposal: HiveDiscoverProposalV2): DiscoverValidationIssue[] {

  const issues: DiscoverValidationIssue[] = [];

  const logicalIds = new Set(proposal.logicalDocuments.map((doc) => doc.id));

  const seenDomainIds = new Set<string>();



  for (const group of proposal.domainGroups) {

    const domainKey = resolvedDomainId(group.domainId);

    if (!domainKey) {

      issues.push({

        code: "MALFORMED_PROPOSAL",

        message: "Domain group is missing domainId.",

        path: `domainGroups/${group.id}/domainId`,

      });

    }

    if (domainKey && seenDomainIds.has(domainKey)) {

      issues.push({

        code: "MALFORMED_PROPOSAL",

        message: `Duplicate domain group for domainId ${domainKey}. Use one domainGroup per domain; pack categories belong on logicalDocuments.groupId.`,

        path: `domainGroups/${group.id}/domainId`,

      });

    }

    if (domainKey) {

      seenDomainIds.add(domainKey);

    }



    for (const logicalId of group.logicalDocumentIds) {

      if (!logicalIds.has(logicalId)) {

        issues.push({

          code: "MALFORMED_PROPOSAL",

          message: `Domain group references unknown logical document: ${logicalId}`,

          path: `domainGroups/${group.id}/logicalDocumentIds`,

        });

      }

    }

  }



  const uniqueDomainIds = uniqueResolvedDomainIds(proposal);



  if (proposal.domainResolution.status === "MULTI_DOMAIN") {

    if (uniqueDomainIds.size < 2) {

      issues.push({

        code: "MALFORMED_PROPOSAL",

        message: "MULTI_DOMAIN collections require documents from at least two domains.",

        path: "domainGroups",

      });

    }

  } else if (

    proposal.domainResolution.status === "SINGLE_DOMAIN" ||

    proposal.domainResolution.status === "RESOLVED"

  ) {

    if (uniqueDomainIds.size > 1) {

      issues.push({

        code: "MALFORMED_PROPOSAL",

        message: "Single-domain collections must resolve to one domain across all domain groups.",

        path: "domainGroups",

      });

    }

  }



  const groupedIds = new Set(proposal.domainGroups.flatMap((group) => group.logicalDocumentIds));

  for (const doc of proposal.logicalDocuments) {

    if (!groupedIds.has(doc.id)) {

      issues.push({

        code: "MALFORMED_PROPOSAL",

        message: `Logical document ${doc.id} is not assigned to a domain group.`,

        path: `logicalDocuments/${doc.id}`,

      });

    }



    const groupDomainId = proposal.domainGroups.find((group) =>

      group.logicalDocumentIds.includes(doc.id),

    )?.domainId;

    if (doc.domainId !== groupDomainId) {

      issues.push({

        code: "MALFORMED_PROPOSAL",

        message: "Logical document domainId does not match its domain group.",

        path: `logicalDocuments/${doc.id}/domainId`,

      });

    }

  }



  return issues;

}

