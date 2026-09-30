import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyValidationResult } from "@hiveforyou/shared/canonical-study";
import type {
  EvidenceReference,
  ProposedClaim,
  ProposedConflict,
  ProposedDerivedClaimCandidate,
  ProposedEntity,
  ProposedEvent,
  ProposedMissingness,
  ProposedRelationship,
} from "@hiveforyou/shared/canonical-study";

export const CASE_INTELLIGENCE_SCHEMA = "case-intelligence/2" as const;

export type CaseIntelligenceScope = "single_domain" | "multi_domain";

export type CaseIntelligenceDomainSlice = {
  domainId: string;
  studyRunId: string;
  domainPackId: string;
  domainPackVersion: string;
};

export type PersistedClaimEvidence = EvidenceReference & {
  claimId: string;
};

export type CaseIntelligenceSnapshot = {
  schemaVersion: typeof CASE_INTELLIGENCE_SCHEMA;
  version: number;
  caseId: string;
  /** Primary study run id (domain run or merge orchestrator). */
  studyRunId: string;
  createdAt: string;
  caseScope: CaseIntelligenceScope;
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  domainSlices?: CaseIntelligenceDomainSlice[];
  sourceDocuments: CanonicalStudyContext["sourceDocuments"];
  entities: ProposedEntity[];
  claims: ProposedClaim[];
  claimEvidence: PersistedClaimEvidence[];
  relationships: ProposedRelationship[];
  crossDomainRelationships?: ProposedRelationship[];
  events: ProposedEvent[];
  conflicts: ProposedConflict[];
  missingness: ProposedMissingness[];
  derivedClaims: ProposedDerivedClaimCandidate[];
  analysisIntent: CanonicalStudyContext["answerSnapshot"]["analysisIntent"];
  userContext: CanonicalStudyContext["answerSnapshot"]["userContext"];
  validationResult: CanonicalStudyValidationResult;
};

export function buildCaseIntelligenceSnapshot(
  context: CanonicalStudyContext,
  validation: CanonicalStudyValidationResult,
  version: number,
): CaseIntelligenceSnapshot {
  const claimEvidence: PersistedClaimEvidence[] = [];
  for (const claim of validation.accepted.claims) {
    for (const ref of claim.evidenceRefs) {
      claimEvidence.push({ ...ref, claimId: claim.id });
    }
  }

  return {
    schemaVersion: CASE_INTELLIGENCE_SCHEMA,
    version,
    caseId: context.caseId,
    studyRunId: context.studyRunId,
    createdAt: new Date().toISOString(),
    caseScope: "single_domain",
    domainId: context.domainId,
    domainPackId: context.domainPackId,
    domainPackVersion: context.domainPackVersion,
    sourceDocuments: JSON.parse(JSON.stringify(context.sourceDocuments)),
    entities: validation.accepted.entities,
    claims: validation.accepted.claims,
    claimEvidence,
    relationships: validation.accepted.relationships,
    events: validation.accepted.events,
    conflicts: validation.accepted.conflicts,
    missingness: validation.accepted.missingness,
    derivedClaims: validation.accepted.derivedClaimCandidates,
    analysisIntent: context.answerSnapshot.analysisIntent,
    userContext: context.answerSnapshot.userContext,
    validationResult: validation,
  };
}
