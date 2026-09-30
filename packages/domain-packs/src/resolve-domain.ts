import type { DomainPackVocabularySnapshot } from "@hiveforyou/shared/canonical-study";



import type { DomainPackAudienceRole } from "./audience-role-catalog";

import { getDiscoverPackByDomainLabel } from "./discover-pack";



export type ResolvedDomainPack = {

  domainId: string;

  domainPackId: string;

  domainPackVersion: string;

  /** @deprecated Engine 2 no longer validates proposal semantics against this snapshot. */

  vocabulary: DomainPackVocabularySnapshot;

  audienceRoles?: DomainPackAudienceRole[];

};



/** Empty vocabulary — Engine 2 uses model-discovered semantic labels, not pack allowlists. */

export const ENGINE2_NEUTRAL_VOCABULARY: DomainPackVocabularySnapshot = {

  entityTypes: [],

  claimTypes: [],

  relationshipTypes: [],

  eventTypes: [],

};



/**

 * Maps Engine 1 presentation domainLabel to stable domainId + discover pack version.

 * Used for routing, idempotency, and audit — not Engine 2 semantic validation.

 */

export function resolveDomainPackFromDiscoveryLabel(

  domainLabel: string,

): ResolvedDomainPack | null {

  const discover = getDiscoverPackByDomainLabel(domainLabel);

  if (!discover) {

    return null;

  }

  return {

    domainId: discover.domainId,

    domainPackId: discover.domainPackId,

    domainPackVersion: discover.domainPackVersion,

    vocabulary: ENGINE2_NEUTRAL_VOCABULARY,

    audienceRoles: discover.audienceRoles,

  };

}



/** @deprecated Engine 2 does not use domain vocabulary allowlists. */

export function isTypeInDomainVocabulary(

  _vocabulary: DomainPackVocabularySnapshot,

  _kind: "entity" | "claim" | "relationship" | "event" | "derivedClaim",

  _typeName: string,

): boolean {

  return true;

}


