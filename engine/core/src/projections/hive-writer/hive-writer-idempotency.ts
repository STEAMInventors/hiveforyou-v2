import { HIVE_UI_CATALOG_VERSION } from "@hiveforyou/shared/hive-ui-tree";
import {
  HIVE_WRITER_CONTRACT_VERSION,
  HIVE_WRITER_IMPLEMENTATION_VERSION,
} from "@hiveforyou/shared/hive-writer-proposal";
import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";

import { hashCanonicalJson } from "../../study/fingerprint.js";

export function buildHiveWriterShadowIdempotencyKey(input: {
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  packContentSha256: string;
  reportProjectionContentSha256: string;
}): string {
  return hashCanonicalJson({
    caseId: input.caseId.trim(),
    studyRunId: input.studyRunId.trim(),
    audience: input.audience,
    packContentSha256: input.packContentSha256.trim().toLowerCase(),
    reportProjectionContentSha256: input.reportProjectionContentSha256.trim().toLowerCase(),
    catalogVersion: HIVE_UI_CATALOG_VERSION,
    writerImplementationVersion: HIVE_WRITER_IMPLEMENTATION_VERSION,
    writerContractVersion: HIVE_WRITER_CONTRACT_VERSION,
  });
}
