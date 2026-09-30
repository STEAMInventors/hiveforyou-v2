import type { DomainPackVocabularySnapshot } from "@hiveforyou/shared/canonical-study";

export type CanonicalStudyPackSnapshot = {
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  domainLabel: string;
  vocabulary: DomainPackVocabularySnapshot;
  /** Declarative study guidance injected beside the generic prompt (not hardcoded in core). */
  studyGuidance?: string;
};

const IEP_STUDY_VOCABULARY: DomainPackVocabularySnapshot = {
  entityTypes: ["person", "organization", "record_item"],
  claimTypes: ["record_statement", "observation"],
  relationshipTypes: ["associated_with", "authored_by"],
  eventTypes: ["dated_entry", "meeting_occurrence"],
  userResponseFactualClaimTypes: [],
};

/** @deprecated Engine 2 no longer uses study pack vocabulary — methodology prompt only. */
export const IEP_STUDY_PACK_SCAFFOLD: CanonicalStudyPackSnapshot = {
  domainId: "iep",
  domainPackId: "hive.domain.iep",
  domainPackVersion: "0.0.0-scaffold",
  domainLabel: "Special education records",
  vocabulary: IEP_STUDY_VOCABULARY,
};

export function getStudyPackByDomainId(domainId: string): CanonicalStudyPackSnapshot | null {
  if (domainId === "iep") {
    return IEP_STUDY_PACK_SCAFFOLD;
  }
  return null;
}
