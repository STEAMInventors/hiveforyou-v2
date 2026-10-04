import type { DomainPackVocabularySnapshot } from "@hiveforyou/shared/canonical-study";

export { IEP_VOCABULARY } from "./iep-vocabulary";

/** @deprecated Engine 2 no longer uses study pack vocabulary — methodology prompt only. */
export const IEP_STUDY_VOCABULARY: DomainPackVocabularySnapshot = {
  entityTypes: ["person", "organization", "record_item"],
  claimTypes: ["record_statement", "observation"],
  relationshipTypes: ["associated_with", "authored_by"],
  eventTypes: ["dated_entry", "meeting_occurrence"],
  userResponseFactualClaimTypes: [],
};
