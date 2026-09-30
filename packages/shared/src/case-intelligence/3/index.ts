export {

  CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,

  CASE_INTELLIGENCE_SCHEMA_V3,

  CLAIM_ROLES,

  CONFLICT_KINDS,

  UNRESOLVED_ITEM_KINDS,

  UNRESOLVED_SOURCES,

} from "./types";



export type {

  CanonicalCaseSnapshot,

  CanonicalEvent,

  CanonicalStudyProposal,

  ClaimRole,

  ClaimValue,

  Conflict,

  ConflictKind,

  EffectivePeriod,

  EvidenceReference,

  ProposalLineage,

  ProposedClaim,

  ProposedConflict,

  ProposedEntity,

  ProposedMissingInformation,

  UnresolvedItem,

  UnresolvedItemKind,

  UnresolvedSource,

  ValidatedClaim,

} from "./types";



export {

  CANONICAL_STUDY_PROPOSAL_V3_JSON_SCHEMA,

  CASE_INTELLIGENCE_V3_JSON_SCHEMA,

  CLAIM_VALUE_V3_JSON_SCHEMA,

  EVIDENCE_REFERENCE_V3_JSON_SCHEMA,

  PROPOSAL_LINEAGE_V3_JSON_SCHEMA,

} from "./json-schema";

export { CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA } from "./openai-proposal-json-schema";

export type { JsonSchema } from "./json-schema";



export {

  validateCanonicalCaseSnapshot,

  validateCanonicalStudyProposal,

} from "./validate";



export type { ContractValidationResult, ContractViolation } from "./validate";

export type { CanonicalStudyValidationResultV3 } from "./validation-result";


