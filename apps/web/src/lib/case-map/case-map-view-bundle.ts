import type { StudyRunErrorCode, StudyRunStatus } from "@hiveforyou/shared/canonical-study";
import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { CaseMap, CaseProvenanceBundle, CaseViewV2, ProView } from "@hiveforyou/shared/projections";

export type CaseMapViewBundle = {
  studyRunId: string;
  caseId: string;
  status: StudyRunStatus;
  errorCode?: StudyRunErrorCode;
  caseMap: CaseMap | null;
  provenance: CaseProvenanceBundle | null;
  proView: ProView | null;
  /** Unified presentation snapshot (case-view/2) when persisted or built at read time. */
  caseView: CaseViewV2 | null;
  /** Loaded for detail surfaces (evidence gaps); not a second truth layer. */
  canonicalSnapshot: CanonicalCaseSnapshot | null;
};
