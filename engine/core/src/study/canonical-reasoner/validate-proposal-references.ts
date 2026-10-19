import type {
  CanonicalStudyReasonerProposal,
  ObservationSnapshot,
} from "@hiveforyou/shared/canonical-study-graph";
import { validateCanonicalStudyReasonerProposal } from "@hiveforyou/shared/canonical-study-graph";

export type ReasonerReferenceViolation = {
  path: string;
  message: string;
  code: "UNKNOWN_OBSERVATION_ID" | "UNKNOWN_OBSERVABLE_ID" | "SCHEMA_INVALID";
};

export type ReasonerProposalStructureResult =
  | { ok: true; proposal: CanonicalStudyReasonerProposal }
  | { ok: false; violations: ReasonerReferenceViolation[] };

function assertObservationIds(
  ids: readonly string[],
  path: string,
  allowed: ReadonlySet<string>,
  violations: ReasonerReferenceViolation[],
): void {
  ids.forEach((id, index) => {
    if (!allowed.has(id)) {
      violations.push({
        path: `${path}[${index}]`,
        message: `unknown observation id: ${id}`,
        code: "UNKNOWN_OBSERVATION_ID",
      });
    }
  });
}

function assertObservableIds(
  ids: readonly string[],
  path: string,
  allowed: ReadonlySet<string>,
  violations: ReasonerReferenceViolation[],
): void {
  ids.forEach((id, index) => {
    if (!allowed.has(id)) {
      violations.push({
        path: `${path}[${index}]`,
        message: `unknown observable id: ${id}`,
        code: "UNKNOWN_OBSERVABLE_ID",
      });
    }
  });
}

/** Phase D: JSON schema + referential integrity against the observation snapshot (not Phase E semantics). */
export function validateReasonerProposalStructure(
  raw: unknown,
  snapshot: ObservationSnapshot,
): ReasonerProposalStructureResult {
  const schemaResult = validateCanonicalStudyReasonerProposal(raw);
  if (!schemaResult.ok) {
    return {
      ok: false,
      violations: schemaResult.errors.map((error) => ({
        path: error.path,
        message: error.message,
        code: "SCHEMA_INVALID",
      })),
    };
  }
  const proposal = schemaResult.value;
  const observationIds = new Set(snapshot.observations.map((obs) => obs.id));
  const observableIds = new Set(proposal.observables.map((obs) => obs.id));
  const violations: ReasonerReferenceViolation[] = [];

  if (proposal.studyRunId !== snapshot.studyRunId) {
    violations.push({
      path: "studyRunId",
      message: "studyRunId must match observation snapshot",
      code: "SCHEMA_INVALID",
    });
  }
  if (proposal.attemptId !== snapshot.attemptId) {
    violations.push({
      path: "attemptId",
      message: "attemptId must match observation snapshot",
      code: "SCHEMA_INVALID",
    });
  }

  proposal.observables.forEach((observable, index) => {
    assertObservationIds(
      observable.observationIds,
      `observables[${index}].observationIds`,
      observationIds,
      violations,
    );
  });

  proposal.observationLinks.forEach((link, index) => {
    assertObservationIds([link.observationId], `observationLinks[${index}].observationId`, observationIds, violations);
    assertObservableIds([link.observableId], `observationLinks[${index}].observableId`, observableIds, violations);
  });

  proposal.relationships.forEach((rel, index) => {
    assertObservableIds(
      [rel.fromObservableId, rel.toObservableId],
      `relationships[${index}]`,
      observableIds,
      violations,
    );
    assertObservationIds(
      rel.supportingObservationIds,
      `relationships[${index}].supportingObservationIds`,
      observationIds,
      violations,
    );
  });

  proposal.resolutions.forEach((res, index) => {
    assertObservationIds(res.observationIds, `resolutions[${index}].observationIds`, observationIds, violations);
    assertObservableIds(res.observableIds, `resolutions[${index}].observableIds`, observableIds, violations);
    assertObservationIds(
      res.supportingObservationIds,
      `resolutions[${index}].supportingObservationIds`,
      observationIds,
      violations,
    );
  });

  proposal.candidateConflicts.forEach((conflict, index) => {
    assertObservationIds(
      conflict.observationIds,
      `candidateConflicts[${index}].observationIds`,
      observationIds,
      violations,
    );
    assertObservationIds(
      conflict.supportingObservationIds,
      `candidateConflicts[${index}].supportingObservationIds`,
      observationIds,
      violations,
    );
  });

  proposal.candidateFindings.forEach((finding, index) => {
    assertObservationIds(
      finding.supportingObservationIds,
      `candidateFindings[${index}].supportingObservationIds`,
      observationIds,
      violations,
    );
  });

  proposal.unresolved.forEach((item, index) => {
    if (item.relatedObservationIds) {
      assertObservationIds(
        item.relatedObservationIds,
        `unresolved[${index}].relatedObservationIds`,
        observationIds,
        violations,
      );
    }
    if (item.relatedObservableIds) {
      assertObservableIds(
        item.relatedObservableIds,
        `unresolved[${index}].relatedObservableIds`,
        observableIds,
        violations,
      );
    }
  });

  if (violations.length > 0) {
    return { ok: false, violations };
  }
  return { ok: true, proposal };
}
