import { requireDiscoverPack } from "@hiveforyou/domain-packs";

const BANKRUPTCY_DISCOVER_PACK = requireDiscoverPack("bankruptcy");
const IEP_DISCOVER_PACK = requireDiscoverPack("iep");
const MEDICAID_DISCOVER_PACK = requireDiscoverPack("medicaid");

import type { HiveDiscoverProposalV2 } from "@hiveforyou/shared/discover";

import { HIVE_DISCOVER_PROPOSAL_SCHEMA_V2 } from "@hiveforyou/shared/discover";



import type { DiscoverEngine, DiscoverEngineContext } from "./engine";



type DomainRoute = {

  domainId: string;

  domainLabel: string;

  pack: typeof IEP_DISCOVER_PACK;

};



function routeSource(sourceDocumentId: string): DomainRoute {

  if (sourceDocumentId.startsWith("domain-bankruptcy")) {

    return {

      domainId: BANKRUPTCY_DISCOVER_PACK.domainId,

      domainLabel: BANKRUPTCY_DISCOVER_PACK.domainLabel,

      pack: BANKRUPTCY_DISCOVER_PACK,

    };

  }

  if (sourceDocumentId.startsWith("domain-medicaid")) {

    return {

      domainId: MEDICAID_DISCOVER_PACK.domainId,

      domainLabel: MEDICAID_DISCOVER_PACK.domainLabel,

      pack: MEDICAID_DISCOVER_PACK,

    };

  }

  if (sourceDocumentId.startsWith("domain-ambiguous")) {

    return {

      domainId: IEP_DISCOVER_PACK.domainId,

      domainLabel: IEP_DISCOVER_PACK.domainLabel,

      pack: IEP_DISCOVER_PACK,

    };

  }

  return {

    domainId: IEP_DISCOVER_PACK.domainId,

    domainLabel: IEP_DISCOVER_PACK.domainLabel,

    pack: IEP_DISCOVER_PACK,

  };

}



function defaultSuggestedObjectives(domainLabel: string): HiveDiscoverProposalV2["domainGroups"][number]["suggestedObjectives"] {

  return [

    {

      id: "obj-prep",

      label: "Prepare for an upcoming meeting",

      summary: `Get oriented before a meeting related to ${domainLabel}.`,

    },

    {

      id: "obj-understand",

      label: "Understand what these documents say",

      summary: "See the main themes and timelines in plain language.",

    },

    {

      id: "obj-compare",

      label: "Compare related records side by side",

      summary: "Line up evaluations, notices, or plans that reference each other.",

    },

    {

      id: "obj-progress",

      label: "Review progress over time",

      summary: "Track how services, decisions, or status changed across dates.",

    },

  ];

}



function defaultSuggestedAudiences(): HiveDiscoverProposalV2["domainGroups"][number]["suggestedAudiences"] {

  return [

    { id: "aud-self", label: "Just for me", roleHint: "personal_review" },

    { id: "aud-advisor", label: "An advisor or advocate", roleHint: "advisor" },

    { id: "aud-other", label: "Someone else", roleHint: "other" },

  ];

}



/**

 * V2 fixture — routes by sourceDocumentId test prefixes only (not filenames).

 */

export class FixtureDiscoverV2Engine implements DiscoverEngine {

  async discover(context: DiscoverEngineContext): Promise<HiveDiscoverProposalV2> {

    const phase = context.discoveryPhase ?? "collection_understanding";

    const routes = context.sourceDocuments.map((source) => routeSource(source.sourceDocumentId));

    const uniqueDomainIds = [...new Set(routes.map((route) => route.domainId))];

    const isMulti = uniqueDomainIds.length > 1;

    const isAmbiguous =

      !isMulti &&

      context.sourceDocuments.some((source) => source.sourceDocumentId.startsWith("domain-ambiguous"));



    const logicalDocuments: HiveDiscoverProposalV2["logicalDocuments"] = [];

    const domainGroupsMap = new Map<
      string,
      Omit<
        HiveDiscoverProposalV2["domainGroups"][number],
        "suggestedObjectives" | "suggestedAudiences"
      >
    >();



    context.sourceDocuments.forEach((source, index) => {

      const route = routes[index]!;

      const logicalId = `doc-${source.sourceDocumentId}`;

      const isEvalLike =

        route.domainId === "iep" &&

        index < 2 &&

        context.sourceDocuments.length >= 2 &&

        !isMulti;

      const documentType =

        route.domainId === "iep"

          ? index === 0

            ? "Individualized Education Program"

            : index === 1

              ? "Psychoeducational evaluation"

              : "Document (unclassified)"

          : route.domainId === "bankruptcy"

            ? "Petition"

            : route.domainId === "medicaid"

              ? "Eligibility notice"

              : "Document (unclassified)";



      logicalDocuments.push({

        id: logicalId,

        domainId: route.domainId,

        sourceDocumentId: source.sourceDocumentId,

        pageStart: 1,

        pageEnd: undefined,

        documentType,

        title: `Uploaded document ${index + 1}`,

        documentDate: undefined,

        familyRole:

          route.domainId === "iep"

            ? index === 0

              ? "Service plan"

              : "Evaluation report"

            : route.domainId === "bankruptcy"

              ? "Court filing"

              : "Agency notice",

        groupId: route.domainId === "iep" ? (index === 0 ? "planning" : "evaluations") : "uploads",

        sequenceOrder: 100 + index,

        recognitionStatus:

          isAmbiguous || isEvalLike ? "ambiguous" : source.sourceDocumentId.includes("unknown")

            ? "unrecognized"

            : "recognized",

      });



      const existing = domainGroupsMap.get(route.domainId);

      if (existing) {

        existing.logicalDocumentIds.push(logicalId);

      } else {

        domainGroupsMap.set(route.domainId, {

          id: `group-${route.domainId}`,

          domainId: route.domainId,

          domainLabel: route.domainLabel,

          logicalDocumentIds: [logicalId],

          description: `Documents related to ${route.domainLabel.toLowerCase()}.`,

        });

      }

    });



    const domainGroups = [...domainGroupsMap.values()];

    const primaryLabel = isMulti ? "Multiple domains" : routes[0]!.domainLabel;



    const ambiguityCandidates: HiveDiscoverProposalV2["ambiguityCandidates"] = [];

    if (isAmbiguous) {

      ambiguityCandidates.push({

        id: "amb-domain-identity",

        kind: "DOMAIN",

        summary: "This upload may belong to more than one domain.",

        relatedLogicalDocumentIds: logicalDocuments.map((doc) => doc.id),

        affectsStructure: true,

      });

    }



    const evalLikeIds = logicalDocuments

      .filter((doc) => doc.recognitionStatus === "ambiguous" && doc.domainId === "iep")

      .map((doc) => doc.id);

    if (phase === "discovery_completion" && evalLikeIds.length >= 2) {

      ambiguityCandidates.push({

        id: "amb-eval-identity",

        kind: "DOCUMENT_IDENTITY",

        summary: "Two evaluation-role documents may belong to the same sequence.",

        relatedLogicalDocumentIds: evalLikeIds,

        affectsStructure: true,

      });

    }



    const clarificationQuestions: HiveDiscoverProposalV2["clarificationQuestions"] =

      phase === "discovery_completion" && evalLikeIds.length >= 2

        ? [

            {

              id: "cq-eval-identity",

              prompt: "Are these documents part of the same evaluation or plan sequence?",

              humanReason: "Two evaluation-role documents may belong to the same sequence.",

              answerKind: "single_choice",

              options: [

                { id: "same_sequence", label: "Yes — they belong together" },

                { id: "separate", label: "No — they are separate" },

                { id: "unsure", label: "I'm not sure" },

              ],

              ambiguityCandidateId: "amb-eval-identity",

              relatedLogicalDocumentIds: evalLikeIds,

            },

          ]

        : [];



    return {

      schemaVersion: HIVE_DISCOVER_PROPOSAL_SCHEMA_V2,

      domainResolution: {

        status: isMulti ? "MULTI_DOMAIN" : isAmbiguous ? "AMBIGUOUS" : "SINGLE_DOMAIN",

        domainLabel: primaryLabel,

        candidateDomainLabels: isMulti
          ? domainGroups.map((group) => group.domainLabel)
          : undefined,

      },

      domainGroups: domainGroups.map((group) => ({
        ...group,
        suggestedObjectives: defaultSuggestedObjectives(group.domainLabel),
        suggestedAudiences: defaultSuggestedAudiences(),
      })),

      logicalDocuments,

      relationships: [],

      ambiguityCandidates,

      clarificationQuestions,

    };

  }

}

