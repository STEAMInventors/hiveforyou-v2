export type PackPrimitiveKind = "check" | "selector" | "match";

export type PackPrimitiveStatus = "implemented" | "partial" | "planned";

export type PackPrimitiveMapEntry = {
  kind: PackPrimitiveKind;
  status: PackPrimitiveStatus;
  runsAs?: string;
  mode?: string;
  gap?: string;
  evidence?: string;
};

const REQUIREMENT_COVERAGE_GAP =
  "Requirement list is a built-in IEP evaluation heuristic in core, not read from the pack; requires_from: document_requests is not consumed.";

export const PACK_PRIMITIVE_MAP = {
  restatement_agreement: {
    kind: "check",
    status: "implemented",
    runsAs: "restatementFindings",
    evidence: "engine/core/src/study/primitives/restatement.ts:19",
  },
  change_over_time: {
    kind: "check",
    status: "partial",
    runsAs: "restatementFindings",
    evidence: "engine/core/src/study/primitives/restatement.ts:19",
    gap: "Value agreement only via restatement; time_indexed change vs conflict is task 4.2.",
  },
  arithmetic: {
    kind: "check",
    status: "implemented",
    runsAs: "arithmeticFindings",
    evidence: "engine/core/src/study/primitives/arithmetic.ts:13",
  },
  stated_vs_observed: {
    kind: "check",
    status: "partial",
    runsAs: "arithmeticFindings",
    evidence: "engine/core/src/study/primitives/arithmetic.ts:13",
    gap: "Only table totals-row reconciliation, not stated vs derived field comparison.",
  },
  none_answer_vs_records: {
    kind: "check",
    status: "planned",
    gap: "No core check for none answers vs record presence.",
  },
  series_continuity: {
    kind: "check",
    status: "implemented",
    runsAs: "seriesContinuityFindings",
    evidence: "engine/core/src/study/primitives/seriesContinuity.ts:20",
  },
  series_over_time: {
    kind: "check",
    status: "partial",
    runsAs: "seriesContinuityFindings",
    evidence: "engine/core/src/study/primitives/seriesContinuity.ts:20",
    gap: "Period-gap continuity only; trend analysis is task 4.4.",
  },
  requirement_coverage: {
    kind: "check",
    status: "partial",
    runsAs: "requirementCoverageFindings",
    evidence: "engine/core/src/study/primitives/requirementCoverage.ts:11",
    gap: REQUIREMENT_COVERAGE_GAP,
  },
  coverage: {
    kind: "check",
    status: "partial",
    runsAs: "requirementCoverageFindings",
    evidence: "engine/core/src/study/primitives/requirementCoverage.ts:11",
    gap: "No mode with set A from selected statements and model-proposed matches.",
  },
  referenced_not_provided: {
    kind: "check",
    status: "partial",
    runsAs: "requirementCoverageFindings",
    evidence: "engine/core/src/study/primitives/requirementCoverage.ts:11",
    gap: "Does not treat document references as requirement set A.",
  },
  request_response_pairing: {
    kind: "check",
    status: "planned",
    gap: "No request/response pairing primitive in core.",
  },
  compose_governing_with_amendments: {
    kind: "check",
    status: "planned",
    gap: "Governing-document composition with amendments is task 4.3.",
  },
  date_relationships: {
    kind: "selector",
    status: "planned",
    gap: "No date-relationship selector in the shadow study path.",
  },
  window_filter: {
    kind: "selector",
    status: "planned",
    gap: "No window filter selector in the shadow study path.",
  },
  threshold: {
    kind: "selector",
    status: "planned",
    gap: "No threshold selector in the shadow study path.",
  },
  as_of_value: {
    kind: "selector",
    status: "planned",
    gap: "No as-of value selector in the shadow study path.",
  },
  identifier_link: {
    kind: "match",
    status: "partial",
    runsAs: "matchParties",
    evidence: "engine/core/src/atoms/match.ts:43",
    gap: "Party/id/name linking only; not full identifier-link graph across statement subjects.",
  },
  party_relation: {
    kind: "match",
    status: "partial",
    runsAs: "matchParties",
    evidence: "engine/core/src/atoms/match.ts:43",
    gap: "Role+name grade-B links only; no dedicated relation-type model.",
  },
} as const satisfies Record<string, PackPrimitiveMapEntry>;

export type PackStudyPrimitive = keyof typeof PACK_PRIMITIVE_MAP;

const PRIMITIVE_SET = new Set<string>(Object.keys(PACK_PRIMITIVE_MAP));

export function isPackStudyPrimitive(name: string): name is PackStudyPrimitive {
  return PRIMITIVE_SET.has(name);
}

export const PACK_STUDY_PRIMITIVES = Object.keys(
  PACK_PRIMITIVE_MAP,
) as PackStudyPrimitive[];
