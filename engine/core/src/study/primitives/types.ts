import type { EvidenceSpan } from "../../atoms/types";
import type { MatchGrade } from "../../atoms/match";

export type FindingKind = "fact" | "change" | "conflict" | "gap" | "unresolved";

export type PrimitiveBasis =
  | "restatement"
  | "arithmetic"
  | "seriesContinuity"
  | "requirementCoverage";

export interface StudyFinding {
  id: string;
  kind: FindingKind;
  basis: PrimitiveBasis;
  grade: MatchGrade | null;
  statementIds: string[];
  evidence: EvidenceSpan[];
  detail: string;
}
