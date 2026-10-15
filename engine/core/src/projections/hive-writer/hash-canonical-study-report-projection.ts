import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";

import { hashCanonicalJson } from "../../study/fingerprint.js";

export function hashCanonicalStudyReportProjection(
  projection: CanonicalStudyReportProjection,
): string {
  return hashCanonicalJson(projection);
}
