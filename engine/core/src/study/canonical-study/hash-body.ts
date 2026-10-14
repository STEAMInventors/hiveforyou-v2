import type { CanonicalStudyArtifactBody } from "@hiveforyou/shared/canonical-study-artifact";

import { hashCanonicalJson } from "../fingerprint.js";

export function hashCanonicalStudyBody(body: CanonicalStudyArtifactBody): string {
  return hashCanonicalJson(body);
}
