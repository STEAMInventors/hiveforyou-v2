import type { DiscoverDomainPackSnapshot } from "@hiveforyou/domain-packs";

import { listDiscoverDomainPacks } from "@hiveforyou/domain-packs";

import {

  HIVE_DISCOVER_PROPOSAL_SCHEMA,

  HIVE_DISCOVER_PROPOSAL_SCHEMA_V2,

} from "@hiveforyou/shared/discover";



import type { LoadedDiscoverPrompt } from "../prompts/load-discover-prompt";

import type { DiscoverSourceDocumentInput } from "./types";



import type { DiscoverEnginePhase } from "./types";



export type ComposedDiscoverPromptInputs = {

  system: string;

  domainPackVocabulary: string;

  sourceDocuments: DiscoverSourceDocumentInput[];

  /** Customer objective from CUSTOMER_ASSERTION — guides emphasis only. */

  customerObjective?: string;

  discoveryPhase?: DiscoverEnginePhase;

  priorCollectionProposalJson?: string;

  outputSchema:

    | typeof HIVE_DISCOVER_PROPOSAL_SCHEMA

    | typeof HIVE_DISCOVER_PROPOSAL_SCHEMA_V2;

};



function serializePackVocabulary(packs: DiscoverDomainPackSnapshot[]): string {

  return JSON.stringify(

    packs.map((pack) => ({

      domainId: pack.domainId,

      domainLabel: pack.domainLabel,

      domainPackId: pack.domainPackId,

      domainPackVersion: pack.domainPackVersion,

      groups: pack.groups,

      documentTypes: pack.documentTypes,

      familyRoles: pack.familyRoles,

      relationshipKinds: pack.relationshipKinds,

      ...(pack.audienceRoles?.length

        ? {

            audienceVocabulary: pack.audienceRoles.map((role) => ({

              roleId: role.roleId,

              label: role.label,

            })),

          }

        : {}),

    })),

    null,

    2,

  );

}



/**

 * Domain Pack vocabulary is injected separately from the versioned system prompt.

 */

export function composeDiscoverPromptInputs(

  prompt: LoadedDiscoverPrompt,

  sourceDocuments: DiscoverSourceDocumentInput[],

  packs: DiscoverDomainPackSnapshot[] = listDiscoverDomainPacks(),

  customerObjective?: string,

  options?: {

    discoveryPhase?: DiscoverEnginePhase;

    priorCollectionProposalJson?: string;

  },

): ComposedDiscoverPromptInputs {

  const outputSchema =

    prompt.version === "v2"

      ? HIVE_DISCOVER_PROPOSAL_SCHEMA_V2

      : HIVE_DISCOVER_PROPOSAL_SCHEMA;

  return {

    system: prompt.content,

    domainPackVocabulary: serializePackVocabulary(packs),

    sourceDocuments,

    customerObjective: customerObjective?.trim() || undefined,

    discoveryPhase: options?.discoveryPhase,

    priorCollectionProposalJson: options?.priorCollectionProposalJson,

    outputSchema,

  };

}

