import type { CompiledCanonicalReasonerContext } from "@hiveforyou/domain-packs/declarative";
import type { ObservationSnapshot, SnapshotObservation } from "@hiveforyou/shared/canonical-study-graph";

export type CompactReasonerObservation = {
  id: string;
  predicateTypeId: string;
  role: SnapshotObservation["role"];
  value: SnapshotObservation["value"];
  unit?: string;
  observedOn?: string;
  effectivePeriod?: SnapshotObservation["effectivePeriod"];
  evidence: Array<{
    sourceDocumentId: string;
    page?: number;
    snippet?: string;
  }>;
};

export type CanonicalReasonerUserContext = {
  studyRunId: string;
  attemptId: string;
  caseId: string;
  domainId: string;
  packPin: ObservationSnapshot["packPin"];
  compiledPackContextSha256: string;
  observationSnapshotDigest: string;
  customerObjective?: string | null;
  documentScopeIds: string[];
  observations: CompactReasonerObservation[];
};

export type BuildReasonerContextOptions = {
  /** Fail closed when observation count exceeds this bound (single-call mode). */
  maxObservationsPerCall?: number;
};

const DEFAULT_MAX_OBSERVATIONS = 512;

function compactObservation(obs: SnapshotObservation): CompactReasonerObservation {
  return {
    id: obs.id,
    predicateTypeId: obs.predicateTypeId,
    role: obs.role,
    value: obs.value,
    unit: obs.unit,
    observedOn: obs.observedOn,
    effectivePeriod: obs.effectivePeriod,
    evidence: obs.evidenceRefs.map((ref) => ({
      sourceDocumentId: ref.sourceDocumentId,
      page: ref.page,
      snippet: ref.snippet,
    })),
  };
}

function collectDocumentScopeIds(observations: readonly SnapshotObservation[]): string[] {
  const ids = new Set<string>();
  for (const obs of observations) {
    for (const ref of obs.evidenceRefs) {
      if (ref.sourceDocumentId?.trim()) {
        ids.add(ref.sourceDocumentId.trim());
      }
      if (ref.logicalDocumentId?.trim()) {
        ids.add(ref.logicalDocumentId.trim());
      }
    }
  }
  return [...ids].sort();
}

/** Deterministic ordering and compact observation projection for model input. */
export function buildCanonicalReasonerUserContext(
  request: {
    studyRunId: string;
    attemptId: string;
    caseId: string;
    domainId: string;
    packPin: ObservationSnapshot["packPin"];
    compiledPackContextSha256: string;
    observationSnapshot: ObservationSnapshot;
    customerObjective?: string | null;
  },
  options: BuildReasonerContextOptions = {},
): CanonicalReasonerUserContext {
  const maxObservations = options.maxObservationsPerCall ?? DEFAULT_MAX_OBSERVATIONS;
  const sorted = [...request.observationSnapshot.observations].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  if (sorted.length > maxObservations) {
    throw new Error(
      `REASONER_CONTEXT_TOO_LARGE:observation_count=${sorted.length},max=${maxObservations}`,
    );
  }
  return {
    studyRunId: request.studyRunId,
    attemptId: request.attemptId,
    caseId: request.caseId,
    domainId: request.domainId,
    packPin: request.packPin,
    compiledPackContextSha256: request.compiledPackContextSha256,
    observationSnapshotDigest: request.observationSnapshot.contentDigest,
    customerObjective: request.customerObjective ?? null,
    documentScopeIds: collectDocumentScopeIds(sorted),
    observations: sorted.map(compactObservation),
  };
}

export function buildCanonicalReasonerUserMessage(input: {
  packContext: CompiledCanonicalReasonerContext;
  userContext: CanonicalReasonerUserContext;
}): string {
  const sections = [
    "## Compiled Domain Pack context (pinned)",
    JSON.stringify(input.packContext, null, 2),
    "## Study pins",
    JSON.stringify(
      {
        studyRunId: input.userContext.studyRunId,
        attemptId: input.userContext.attemptId,
        caseId: input.userContext.caseId,
        domainId: input.userContext.domainId,
        packPin: input.userContext.packPin,
        compiledPackContextSha256: input.userContext.compiledPackContextSha256,
        observationSnapshotDigest: input.userContext.observationSnapshotDigest,
        documentScopeIds: input.userContext.documentScopeIds,
      },
      null,
      2,
    ),
    "## Customer objective (emphasis only — not evidence)",
    input.userContext.customerObjective?.trim() || "(none)",
    "## Verified observations (immutable — reference by `id` only)",
    JSON.stringify(input.userContext.observations, null, 2),
    "## Reminder",
    "Return JSON for the graph proposal body. Every observationId must appear in the observations list above.",
  ];
  return sections.join("\n\n");
}
