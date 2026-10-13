import { hashCanonicalJson } from "../fingerprint.js";
import type { CanonicalStudyFoundationArtifactBody } from "@hiveforyou/shared/canonical-study-foundation";

/** Hash deterministic artifact body — excludes createdAt and contentSha256. */
export function hashCanonicalStudyFoundationBody(
  body: CanonicalStudyFoundationArtifactBody,
): string {
  return hashCanonicalJson(body);
}
