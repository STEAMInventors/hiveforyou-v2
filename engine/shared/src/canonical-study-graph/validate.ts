import {
  ACCEPTED_CANONICAL_STUDY_GRAPH_JSON_SCHEMA,
  CANONICAL_STUDY_GRAPH_VALIDATION_JSON_SCHEMA,
  CANONICAL_STUDY_PROJECTION_MANIFEST_JSON_SCHEMA,
  CANONICAL_STUDY_REASONER_PROPOSAL_JSON_SCHEMA,
  OBSERVATION_SNAPSHOT_JSON_SCHEMA,
} from "./json-schema.js";
import type {
  AcceptedCanonicalStudyGraph,
  CanonicalStudyProjectionManifest,
  CanonicalStudyReasonerProposal,
  FindingProposal,
  ObservationSnapshot,
} from "./types.js";
import type { CanonicalStudyGraphValidationResult } from "./validation-result.js";
import {
  assertUniqueIds,
  type ContractValidationResult,
  type ContractViolation,
  validateAgainstSchema,
} from "./schema-validate.js";

export type { ContractValidationResult, ContractViolation };

export function validateObservationSnapshot(
  input: unknown,
): ContractValidationResult<ObservationSnapshot> {
  const errors: ContractViolation[] = [];
  validateAgainstSchema(input, OBSERVATION_SNAPSHOT_JSON_SCHEMA, "$", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const snapshot = input as ObservationSnapshot;
  assertUniqueIds(snapshot.observations, "observations", errors);
  assertSnapshotObservationsVerified(snapshot, errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: snapshot };
}

function assertSnapshotObservationsVerified(
  snapshot: ObservationSnapshot,
  errors: ContractViolation[],
): void {
  snapshot.observations.forEach((obs, index) => {
    if (obs.verificationStatus !== "verified") {
      errors.push({
        path: `observations[${index}].verificationStatus`,
        message: "only verified observations are allowed in a snapshot",
      });
    }
    const hasLocator =
      (typeof obs.evidenceRefs[0]?.page === "number" && obs.evidenceRefs[0].page > 0) ||
      Boolean(obs.evidenceRefs[0]?.snippet?.trim());
    if (!hasLocator) {
      errors.push({
        path: `observations[${index}].evidenceRefs`,
        message: "each observation requires a page or snippet locator",
      });
    }
  });
}

export function validateCanonicalStudyReasonerProposal(
  input: unknown,
): ContractValidationResult<CanonicalStudyReasonerProposal> {
  const errors: ContractViolation[] = [];
  validateAgainstSchema(input, CANONICAL_STUDY_REASONER_PROPOSAL_JSON_SCHEMA, "$", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const proposal = input as CanonicalStudyReasonerProposal;
  assertUniqueIds(proposal.observables, "observables", errors);
  assertUniqueIds(proposal.relationships, "relationships", errors);
  assertUniqueIds(proposal.resolutions, "resolutions", errors);
  assertUniqueIds(proposal.candidateConflicts, "candidateConflicts", errors);
  assertUniqueIds(proposal.candidateFindings, "candidateFindings", errors);
  assertUniqueIds(proposal.unresolved, "unresolved", errors);
  assertAbsenceFindingProposedShape(proposal.candidateFindings, "candidateFindings", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: proposal };
}

export function validateAcceptedCanonicalStudyGraph(
  input: unknown,
): ContractValidationResult<AcceptedCanonicalStudyGraph> {
  const errors: ContractViolation[] = [];
  validateAgainstSchema(input, ACCEPTED_CANONICAL_STUDY_GRAPH_JSON_SCHEMA, "$", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const graph = input as AcceptedCanonicalStudyGraph;
  assertUniqueIds(graph.observables, "observables", errors);
  assertUniqueIds(graph.relationships, "relationships", errors);
  assertUniqueIds(graph.resolutions, "resolutions", errors);
  assertUniqueIds(graph.conflicts, "conflicts", errors);
  assertUniqueIds(graph.findings, "findings", errors);
  assertUniqueIds(graph.unresolved, "unresolved", errors);
  assertUniqueIds(graph.observations, "observations", errors);
  assertAbsenceFindingAcceptedShape(graph.findings, "findings", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: graph };
}

export function validateCanonicalStudyGraphValidationResult(
  input: unknown,
): ContractValidationResult<CanonicalStudyGraphValidationResult> {
  const errors: ContractViolation[] = [];
  validateAgainstSchema(input, CANONICAL_STUDY_GRAPH_VALIDATION_JSON_SCHEMA, "$", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: input as CanonicalStudyGraphValidationResult };
}

export function validateCanonicalStudyProjectionManifest(
  input: unknown,
): ContractValidationResult<CanonicalStudyProjectionManifest> {
  const errors: ContractViolation[] = [];
  validateAgainstSchema(input, CANONICAL_STUDY_PROJECTION_MANIFEST_JSON_SCHEMA, "$", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: input as CanonicalStudyProjectionManifest };
}

/** Reasoner proposal: absence kind must include scope block (flags may still be false). */
export function assertAbsenceFindingProposedShape(
  findings: readonly FindingProposal[],
  pathPrefix: string,
  errors: ContractViolation[],
): void {
  findings.forEach((finding, index) => {
    if (finding.kind !== "absence") {
      return;
    }
    if (!finding.absenceScope) {
      errors.push({
        path: `${pathPrefix}[${index}].absenceScope`,
        message: "absence findings must declare absenceScope",
      });
    }
  });
}

/** Accepted graph: absence findings must have established scope (L3). */
export function assertAbsenceFindingAcceptedShape(
  findings: readonly FindingProposal[],
  pathPrefix: string,
  errors: ContractViolation[],
): void {
  findings.forEach((finding, index) => {
    if (finding.kind !== "absence") {
      return;
    }
    if (!isAbsenceFindingAcceptable(finding)) {
      errors.push({
        path: `${pathPrefix}[${index}].absenceScope`,
        message:
          "accepted absence findings require documentCoverageEstablished and searchScopeDeclared",
      });
    }
  });
}

/** Phase E helper: reject absence finding acceptance when scope flags are false. */
export function isAbsenceFindingAcceptable(finding: FindingProposal): boolean {
  if (finding.kind !== "absence") {
    return true;
  }
  const scope = finding.absenceScope;
  if (!scope) {
    return false;
  }
  return scope.documentCoverageEstablished && scope.searchScopeDeclared;
}
